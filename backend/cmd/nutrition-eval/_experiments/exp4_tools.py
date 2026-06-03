#!/usr/bin/env python3
"""
Experiment 4 — tool-augmented, deterministic compute (the research's Architecture B).

Agentic loop: the model calls food_db_search per ingredient (real USDA FoodData
Central per-100g values), picks the best candidate, decides grams + absorbed
cooking fat from the steps, then calls finalize. CODE does the arithmetic from
the looked-up values — the model never invents a nutrient number. All prompts are
GENERIC. Measured on the same 14-recipe ground truth.

Run:  python backend/cmd/nutrition-eval/_experiments/exp4_tools.py
"""
import json, pathlib, time, urllib.request, urllib.parse
import anthropic

HERE = pathlib.Path(__file__).resolve().parent
EVAL_SET = HERE.parent / "recipes.json"
ENV = HERE.parents[2] / ".env"
MODEL = "claude-sonnet-4-6"
PRICE = {"in": 3.0, "out": 15.0}
MACROS = ["kcal", "protein_g", "fat_g", "carbs_g", "sugar_g", "fibre_g"]
NID = {"protein_g": 1003, "fat_g": 1004, "carbs_g": 1005, "sugar_g": 2000, "fibre_g": 1079}

def envval(k):
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith(k + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"{k} not found")

FDC_KEY = envval("FDC_API_KEY")
food_cache = {}  # fdcId -> per-100g macros dict

def macros_of(food):
    m = {k: 0.0 for k in MACROS}
    energy = {}
    for fn in food.get("foodNutrients", []):
        nid, val = fn.get("nutrientId"), fn.get("value", 0.0) or 0.0
        if nid in (1008, 2047, 2048):
            energy[nid] = val
        for k, w in NID.items():
            if nid == w:
                m[k] = val
    m["kcal"] = energy.get(1008) or energy.get(2047) or energy.get(2048) \
        or (4 * m["protein_g"] + 9 * m["fat_g"] + 4 * m["carbs_g"])
    return m

def fdc_search(query, n=5):
    url = "https://api.nal.usda.gov/fdc/v1/foods/search?" + urllib.parse.urlencode(
        {"query": query, "api_key": FDC_KEY, "pageSize": n, "dataType": "Foundation,SR Legacy"})
    for _ in range(3):
        try:
            data = json.load(urllib.request.urlopen(url, timeout=30)); break
        except Exception:
            time.sleep(2)
    else:
        return []
    out = []
    for f in data.get("foods", [])[:n]:
        fid = str(f["fdcId"]); m = macros_of(f); food_cache[fid] = m
        out.append({"food_id": fid, "description": f.get("description", ""),
                    "per_100g": {k: round(v, 1) for k, v in m.items()}})
    return out

def compute_total(args):
    total = {k: 0.0 for k in MACROS}
    for li in args.get("line_items", []):
        m = food_cache.get(str(li.get("food_id")))
        if not m:
            continue
        g = li.get("grams", 0) or 0
        for k in MACROS:
            total[k] += m[k] * g / 100.0
    oil = args.get("absorbed_cooking_fat_g", 0) or 0
    total["kcal"] += 9 * oil; total["fat_g"] += oil
    return total

SEARCH_TOOL = {
    "name": "food_db_search",
    "description": "Sucht Lebensmittel in der USDA-Nährwertdatenbank (englische, generische Begriffe, z.B. 'butter', 'white wheat flour', 'pork tenderloin raw') und gibt mehrere Kandidaten mit Nährwerten pro 100 g zurück. Wähle aus den Kandidaten den am besten passenden aus (achte auf roh/gekocht, Sorte, Fettgehalt).",
    "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
}
FINALIZE_TOOL = {
    "name": "finalize",
    "description": "Berechnet die Gesamt-Nährwerte deterministisch. Gib für jede essbare Zutat die gewählte food_id (aus food_db_search) und die Menge in Gramm an. absorbed_cooking_fat_g = Gramm Bratöl/-fett, das beim Garen aufgenommen wird und im Gericht bleibt (0 wenn keines). Die Werte werden automatisch berechnet — schätze sie NICHT selbst.",
    "input_schema": {"type": "object", "properties": {
        "line_items": {"type": "array", "items": {"type": "object", "properties": {
            "ingredient": {"type": "string"}, "food_id": {"type": "string"}, "grams": {"type": "number"}},
            "required": ["ingredient", "food_id", "grams"]}},
        "absorbed_cooking_fat_g": {"type": "number"}},
        "required": ["line_items", "absorbed_cooking_fat_g"]},
}

SYSTEM = """Du bist ein Ernährungsexperte und schätzt die Gesamt-Nährwerte eines Rezepts (Summe über alle Portionen, NICHT pro Portion).

Vorgehen:
1. Gehe jede ESSBARE Zutat durch und suche sie mit food_db_search (englische, generische Begriffe). Wähle aus den Kandidaten den passendsten (richtige Sorte, roh/gekocht, Fettgehalt). Salz, Gewürze und nicht bezifferbare Kleinstmengen kannst du weglassen.
2. Schätze die Menge jeder Zutat in Gramm: Haushaltsmaße umrechnen (EL ~15 g, TL ~5 g, Stück/Packung nach üblichem Gewicht); Knochen/nicht Essbares abziehen; Nudeln/Reis nach Trockengewicht.
3. Lies die Zubereitungsschritte: schätze, wie viel Bratöl/-fett beim Braten/Frittieren aufgenommen wird und im Gericht bleibt (Frittiertes/Paniertes nimmt viel auf; beim Abgießen/Auslassen geht Fett verloren).
4. Rufe finalize mit allen Zutaten (food_id + Gramm) und dem aufgenommenen Fett auf. Die Nährwerte werden automatisch aus der Datenbank berechnet."""

def recipe_text(r):
    out = [f"Titel: {r['title']}", f"Portionen: {r['servings']}", "", "Zutaten:"]
    for ing in r["ingredients"]:
        out.append(f"- {ing['amount'].strip()} {ing['name']}".strip())
    if r.get("steps"):
        out += ["", "Zubereitung:"] + [f"{i}. {s}" for i, s in enumerate(r["steps"], 1)]
    return "\n".join(out)

def estimate(client, r):
    messages = [{"role": "user", "content": recipe_text(r)}]
    in_tok = out_tok = 0
    for _ in range(25):
        msg = client.messages.create(model=MODEL, max_tokens=2048, system=SYSTEM,
                                     tools=[SEARCH_TOOL, FINALIZE_TOOL], messages=messages)
        in_tok += msg.usage.input_tokens; out_tok += msg.usage.output_tokens
        if msg.stop_reason != "tool_use":
            messages.append({"role": "assistant", "content": msg.content})
            messages.append({"role": "user", "content": "Bitte nutze food_db_search für die Zutaten und dann finalize."})
            continue
        messages.append({"role": "assistant", "content": msg.content})
        results, total = [], None
        for b in msg.content:
            if b.type != "tool_use":
                continue
            if b.name == "food_db_search":
                res = fdc_search(b.input.get("query", ""))
                results.append({"type": "tool_result", "tool_use_id": b.id,
                                "content": json.dumps(res, ensure_ascii=False)})
            elif b.name == "finalize":
                total = compute_total(b.input)
                results.append({"type": "tool_result", "tool_use_id": b.id,
                                "content": json.dumps({k: round(v, 1) for k, v in total.items()}, ensure_ascii=False)})
        messages.append({"role": "user", "content": results})
        if total is not None:
            return total, in_tok, out_tok
    raise RuntimeError("no finalize")

def main():
    client = anthropic.Anthropic(api_key=envval("ANTHROPIC_API_KEY"))
    recipes = json.loads(EVAL_SET.read_text(encoding="utf-8"))
    errs = {m: [] for m in MACROS}
    in_tok = out_tok = 0
    for r in recipes:
        ref = r["reference"]["per_recipe"]
        for _ in range(2):
            try:
                est, it, ot = estimate(client, r); break
            except Exception as e:
                print(f"  retry {r['id']}: {e}"); time.sleep(2)
        else:
            print(f"  FAILED {r['id']}"); continue
        in_tok += it; out_tok += ot
        kpe = (est["kcal"] - ref["kcal"]) / ref["kcal"] * 100
        for m in MACROS:
            if ref[m] > 0:
                errs[m].append((est[m] - ref[m]) / ref[m] * 100)
        print(f"  {r['title'][:34]:34} kcal {est['kcal']:6.0f} vs {ref['kcal']:6.0f}  ({kpe:+5.0f}%)")

    def mape(m): return sum(abs(x) for x in errs[m]) / len(errs[m])
    def bias(m): return sum(errs[m]) / len(errs[m])
    def acc20(m): return 100 * sum(1 for x in errs[m] if abs(x) <= 20) / len(errs[m])
    cost = in_tok * PRICE["in"] / 1e6 + out_tok * PRICE["out"] / 1e6
    print("\n=== Experiment 4: tool-augmented + USDA FDC + deterministic compute ===")
    print(f"{'macro':10} {'MAPE%':>7} {'bias%':>7} {'Acc@20%':>8}   (exp3 kcal: MAPE 15.1 / Acc 79)")
    for m in MACROS:
        print(f"{m:10} {mape(m):7.1f} {bias(m):+7.1f} {acc20(m):8.0f}")
    print(f"\nrecipes={len(errs['kcal'])}  in_tok={in_tok}  out_tok={out_tok}  cost=${cost:.4f}")

if __name__ == "__main__":
    main()
