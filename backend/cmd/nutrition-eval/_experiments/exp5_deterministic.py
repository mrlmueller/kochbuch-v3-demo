#!/usr/bin/env python3
"""
Experiment 5 — deterministic amount->grams + cooking transforms (M2+M3 prototype).

The LLM only RESOLVES and CLASSIFIES: per ingredient it picks a USDA food match
and gives a STRUCTURED amount (value+unit) + food_class + cooking method. Then
table-driven CODE does everything quantitative: unit/piece/pack -> grams,
bone/edible fraction, absorbed frying-oil (Bognar uptake), rendered-fat drain.
The model never guesses grams or oil. All prompts/tables are GENERIC.

Run:  python backend/cmd/nutrition-eval/_experiments/exp5_deterministic.py
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
    raise SystemExit(f"{k} missing")

FDC_KEY = envval("FDC_API_KEY")
food_cache = {}

# ---- deterministic tables (seeded from the ground-truth findings + Bognar) ---
UNIT_ML = {"ml": 1, "l": 1000, "EL": 15, "TL": 5, "Tasse": 240}
PIECE_G = {"onion": 110, "tomato": 110, "aubergine": 275, "egg": 53, "egg_yolk": 18,
           "corn_cob": 110, "garlic_clove": 4, "apple": 150, "potato": 150,
           "tortilla": 64, "sausage": 100, "default": 100}
PACK_G = {"pasta": 500, "spaetzle": 500, "default": 500}
EDIBLE = {"pork_ribs": 0.60, "default": 1.0}            # 1 - bone/inedible fraction
FAT_UPTAKE = {"deepfry": 5, "deepfry_breaded": 6, "panfry_breaded": 6, "deepfry_dough": 7}  # g oil/100g
MEAT = {"ground_meat", "pork", "pork_ribs", "chicken", "beef", "sausage", "lamb"}
FOOD_CLASSES = ["oil","butter","flour","sugar","egg","egg_yolk","milk","cream","cheese",
                "cream_cheese","creme_fraiche","potato","onion","tomato","aubergine",
                "garlic_clove","corn_cob","apple","pasta","spaetzle","breadcrumbs",
                "ground_meat","pork","pork_ribs","chicken","fish","salmon","sausage",
                "tortilla","honey","jam","sauce","vegetable","fruit","other"]
UNITS = ["g","kg","ml","l","EL","TL","Tasse","Stück","Packung","Dose","Zehe","Bund","Prise","nach_Bedarf"]
METHODS = ["raw","boil","simmer","steam","panfry","panfry_breaded","deepfry",
           "deepfry_breaded","deepfry_dough","bake","roast","grill"]

def to_grams(v, unit, fc):
    if v is None: return 0.0
    if unit == "g": return v
    if unit == "kg": return v * 1000
    if unit in UNIT_ML:
        dens = 0.92 if fc == "oil" else (1.03 if fc in ("milk", "cream", "creme_fraiche") else 1.0)
        return v * UNIT_ML[unit] * dens
    if unit == "Stück": return v * PIECE_G.get(fc, PIECE_G["default"])
    if unit == "Packung": return v * PACK_G.get(fc, PACK_G["default"])
    if unit == "Dose": return v * 400
    if unit == "Zehe": return v * 4
    if unit == "Bund": return v * 25
    return 0.0  # Prise / nach_Bedarf

def compute(line_items):
    total = {k: 0.0 for k in MACROS}
    for li in line_items:
        m = food_cache.get(str(li.get("food_id")))
        if not m: continue
        fc, method = li.get("food_class", "other"), li.get("method", "raw")
        if fc == "oil" and method in ("deepfry", "deepfry_breaded", "deepfry_dough"):
            continue  # frying-BATH oil is not eaten; only absorbed uptake counts (added below on the fried item)
        g = to_grams(li.get("amount_value"), li.get("amount_unit"), fc) * EDIBLE.get(fc, 1.0)
        if g <= 0: continue
        fat_factor = 1.0
        if fc in MEAT:
            fat_factor = 0.65 if method in ("boil", "simmer") else (0.80 if method in ("roast", "grill") else 1.0)
        for k in MACROS:
            val = m[k] * g / 100.0
            if k == "fat_g": val *= fat_factor
            if k == "kcal": val -= (1 - fat_factor) * m["fat_g"] * g / 100.0 * 9
            total[k] += val
        ab = FAT_UPTAKE.get(method, 0) * g / 100.0
        if ab:
            total["fat_g"] += ab; total["kcal"] += 9 * ab
    return total

# ---- FDC search (5 candidates, robust energy) --------------------------------
def macros_of(food):
    m = {k: 0.0 for k in MACROS}; energy = {}
    for fn in food.get("foodNutrients", []):
        nid, val = fn.get("nutrientId"), fn.get("value", 0.0) or 0.0
        if nid in (1008, 2047, 2048): energy[nid] = val
        for k, w in NID.items():
            if nid == w: m[k] = val
    m["kcal"] = energy.get(1008) or energy.get(2047) or energy.get(2048) or (4*m["protein_g"]+9*m["fat_g"]+4*m["carbs_g"])
    return m

def fdc_search(query, n=5):
    url = "https://api.nal.usda.gov/fdc/v1/foods/search?" + urllib.parse.urlencode(
        {"query": query, "api_key": FDC_KEY, "pageSize": n, "dataType": "Foundation,SR Legacy"})
    for _ in range(3):
        try: data = json.load(urllib.request.urlopen(url, timeout=30)); break
        except Exception: time.sleep(2)
    else: return []
    out = []
    for f in data.get("foods", [])[:n]:
        fid = str(f["fdcId"]); m = macros_of(f); food_cache[fid] = m
        out.append({"food_id": fid, "description": f.get("description", ""),
                    "per_100g": {k: round(v, 1) for k, v in m.items()}})
    return out

SEARCH_TOOL = {"name": "food_db_search",
    "description": "Sucht Lebensmittel in der USDA-Datenbank (englische, generische Begriffe) und gibt Kandidaten mit Nährwerten pro 100 g zurück. Wähle den passendsten (Sorte, roh/gekocht, Fettgehalt).",
    "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}
FINALIZE_TOOL = {"name": "finalize",
    "description": "Übergibt die aufgelösten, klassifizierten Zutaten. Umrechnung in Gramm, Knochenabzug, Bratöl-Aufnahme und Fettverlust werden AUTOMATISCH berechnet — schätze sie NICHT.",
    "input_schema": {"type": "object", "properties": {"line_items": {"type": "array", "items": {
        "type": "object", "properties": {
            "ingredient": {"type": "string"},
            "food_id": {"type": "string"},
            "amount_value": {"type": "number"},
            "amount_unit": {"type": "string", "enum": UNITS},
            "food_class": {"type": "string", "enum": FOOD_CLASSES},
            "method": {"type": "string", "enum": METHODS}},
        "required": ["ingredient", "food_id", "amount_value", "amount_unit", "food_class", "method"]}}},
        "required": ["line_items"]}}

SYSTEM = """Du bist ein Ernährungsexperte und schätzt die Gesamt-Nährwerte eines Rezepts (Summe über alle Portionen).

Für JEDE essbare Zutat:
1. Suche sie mit food_db_search (englische, generische Begriffe) und wähle den passendsten Kandidaten.
2. Gib die Menge STRUKTURIERT an: amount_value (Zahl) + amount_unit. Rechne NICHT selbst in Gramm um — gib die Originaleinheit an (z.B. "2 EL" -> value 2, unit "EL"; "1,5 kg" -> 1.5, "kg"; "2 Auberginen" -> 2, "Stück"; "eine Packung" -> 1, "Packung").
3. Gib die food_class und die method (Garmethode laut Zubereitungsschritten) an.

WICHTIG: Umrechnung in Gramm, Abzug von Knochen/Schale, aufgenommenes Bratöl beim Frittieren und Fettverlust beim Braten/Auslassen werden AUTOMATISCH und einheitlich berechnet. Schätze diese NICHT selbst. Salz, Gewürze und nicht bezifferbare Kleinstmengen kannst du weglassen. Öl/Fett, das nur als Frittierbad dient (z.B. „zum Frittieren"), gehört NICHT in die Zutatenliste — nur das im Gericht verbleibende Fett zählt, und das wird automatisch ergänzt.

Rufe am Ende finalize mit allen Zutaten auf."""

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
            messages.append({"role": "user", "content": "Bitte food_db_search nutzen und dann finalize."})
            continue
        messages.append({"role": "assistant", "content": msg.content})
        results, total = [], None
        for b in msg.content:
            if b.type != "tool_use": continue
            if b.name == "food_db_search":
                results.append({"type": "tool_result", "tool_use_id": b.id,
                                "content": json.dumps(fdc_search(b.input.get("query", "")), ensure_ascii=False)})
            elif b.name == "finalize":
                total = compute(b.input.get("line_items", []))
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
            try: est, it, ot = estimate(client, r); break
            except Exception as e: print(f"  retry {r['id']}: {e}"); time.sleep(2)
        else: print(f"  FAILED {r['id']}"); continue
        in_tok += it; out_tok += ot
        kpe = (est["kcal"] - ref["kcal"]) / ref["kcal"] * 100
        for m in MACROS:
            if ref[m] > 0: errs[m].append((est[m] - ref[m]) / ref[m] * 100)
        print(f"  {r['title'][:34]:34} kcal {est['kcal']:6.0f} vs {ref['kcal']:6.0f}  ({kpe:+5.0f}%)")
    def mape(m): return sum(abs(x) for x in errs[m]) / len(errs[m])
    def bias(m): return sum(errs[m]) / len(errs[m])
    def acc20(m): return 100 * sum(1 for x in errs[m] if abs(x) <= 20) / len(errs[m])
    cost = in_tok * PRICE["in"] / 1e6 + out_tok * PRICE["out"] / 1e6
    print("\n=== Experiment 5: deterministic grams + cooking transforms (USDA + tables) ===")
    print(f"{'macro':10} {'MAPE%':>7} {'bias%':>7} {'Acc@20%':>8}   (exp3 prompt: 15.1/79 | exp4 FDC: 19.9/79)")
    for m in MACROS:
        print(f"{m:10} {mape(m):7.1f} {bias(m):+7.1f} {acc20(m):8.0f}")
    print(f"\nrecipes={len(errs['kcal'])}  in_tok={in_tok}  out_tok={out_tok}  cost=${cost:.4f}")

if __name__ == "__main__":
    main()
