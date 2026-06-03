#!/usr/bin/env python3
"""
Experiment 7 — LLM owns amount->grams; deterministic code does ONLY transforms.

exp6 showed the deterministic piece/pack table is brittle on the long tail
(40 Stück wrappers x 100g = 4 kg -> +310%). exp3 (pure-LLM) handled those same
amounts fine (the model knows a wrapper ~10 g and that not all 40 are used). So
exp7 hands amount->grams back to the LLM and keeps deterministic code ONLY for the
cooking transforms the model is biased on (bone/edible fraction, absorbed frying
oil, rendered-fat drain) — the corrections exp3 misses (Spareribs +49%, Mais +46%).

  the LLM RESOLVES -> {per_100g (qualifier-aware, raw basis), grams (total as
      listed, incl. bone/peel), food_class, cooking method}
  deterministic CODE -> edible fraction, fat rendering, frying-oil uptake, sum.

Auditable, qualifier-aware, robust to amount type, and transform-corrected. GENERIC.

Run:  python backend/cmd/nutrition-eval/_experiments/exp7_llm_grams.py [dataset.json]
"""
import json, pathlib, sys, time
import anthropic

HERE = pathlib.Path(__file__).resolve().parent
EVAL_SET = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE.parent / "recipes.json"
ENV = HERE.parents[2] / ".env"
MODEL = "claude-sonnet-4-6"
PRICE = {"in": 3.0, "out": 15.0}
MACROS = ["kcal", "protein_g", "fat_g", "carbs_g", "sugar_g", "fibre_g"]

def envval(k):
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith(k + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"{k} missing")

# ---- deterministic COOKING transforms only (no amount->grams table) ----------
EDIBLE = {"pork_ribs": 0.60, "chicken_whole": 0.65, "default": 1.0}   # 1 - bone/shell
FAT_UPTAKE = {"deepfry": 5, "deepfry_breaded": 6, "panfry_breaded": 6, "deepfry_dough": 7}  # g oil/100g
MEAT = {"ground_meat", "pork", "pork_ribs", "chicken", "chicken_whole", "beef", "sausage", "lamb"}
FOOD_CLASSES = ["oil", "fatty_meat", "ground_meat", "pork", "pork_ribs", "chicken", "chicken_whole",
                "beef", "sausage", "lamb", "fish", "shrimp", "salmon", "tofu", "egg", "dairy",
                "cheese", "cream", "starch", "vegetable", "fruit", "legume", "nuts", "sauce", "other"]
METHODS = ["raw", "boil", "simmer", "steam", "panfry", "panfry_breaded", "deepfry",
           "deepfry_breaded", "deepfry_dough", "bake", "roast", "grill"]

def compute(line_items):
    total = {k: 0.0 for k in MACROS}
    for li in line_items:
        m = li.get("per_100g") or {}
        fc, method = li.get("food_class", "other"), li.get("method", "raw")
        if fc == "oil" and method in ("deepfry", "deepfry_breaded", "deepfry_dough"):
            continue  # frying-bath oil is not eaten; only absorbed uptake counts
        g = (li.get("grams") or 0) * EDIBLE.get(fc, 1.0)
        if g <= 0: continue
        fat_factor = 1.0
        if fc in MEAT:
            fat_factor = 0.65 if method in ("boil", "simmer") else (0.80 if method in ("roast", "grill") else 1.0)
        fat100 = float(m.get("fat_g", 0) or 0)
        for k in MACROS:
            val = float(m.get(k, 0) or 0) * g / 100.0
            if k == "fat_g": val *= fat_factor
            if k == "kcal": val -= (1 - fat_factor) * fat100 * g / 100.0 * 9
            total[k] += val
        ab = FAT_UPTAKE.get(method, 0) * g / 100.0
        if ab:
            total["fat_g"] += ab; total["kcal"] += 9 * ab
    return total

FINALIZE_TOOL = {"name": "finalize",
    "description": "Übergibt die aufgelösten Zutaten. Knochenabzug, Bratöl-Aufnahme und Fettverlust beim Garen werden AUTOMATISCH berechnet — schätze diese NICHT.",
    "input_schema": {"type": "object", "properties": {"line_items": {"type": "array", "items": {
        "type": "object", "properties": {
            "ingredient": {"type": "string"},
            "per_100g": {"type": "object",
                "description": "Nährwerte pro 100 g dieser Zutat (roh/wie eingekauft), passend zur Sorte/Fettstufe.",
                "properties": {m: {"type": "number"} for m in MACROS}, "required": MACROS},
            "grams": {"type": "number",
                "description": "Gesamtgewicht dieser Zutat im Rezept in Gramm (wie gelistet/eingekauft, inkl. Knochen/Schale; realistische Stück-/Packungsgrößen, nur die tatsächlich verwendete Menge)."},
            "food_class": {"type": "string", "enum": FOOD_CLASSES},
            "method": {"type": "string", "enum": METHODS}},
        "required": ["ingredient", "per_100g", "grams", "food_class", "method"]}}},
        "required": ["line_items"]}}

SYSTEM = """Du bist ein Ernährungsexperte und schätzt die Gesamt-Nährwerte eines Rezepts (Summe über alle Portionen).

Für JEDE essbare Zutat:
1. Bestimme die Nährwerte PRO 100 g (kcal, Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe) für GENAU diese Zutat. Berücksichtige „fettarm", „mager", „Vollfett", „10 % Fett", Sorte, roh/getrocknet — Werte auf ROH-Basis (wie eingekauft).
2. Bestimme das Gesamtgewicht der Zutat im Rezept in GRAMM (grams). Rechne Haushaltsmaße und Stückzahlen realistisch um (z.B. ein Frühlingsrollenblatt ~10 g, ein Reispapier ~12 g, ein Lasagneblatt ~15 g, ein Ei ~55 g) und nutze nur die tatsächlich verwendete Menge (nicht die ganze Packung, wenn weniger gebraucht wird). Gib das Gewicht inkl. Knochen/Schale an, falls vorhanden.
3. Gib food_class und method (Garmethode laut Zubereitung) an.

WICHTIG: Abzug von Knochen/Schale, aufgenommenes Bratöl beim Frittieren und Fettverlust beim Braten/Auslassen werden AUTOMATISCH berechnet — mach das NICHT selbst. Gib die Nährwerte pro 100 g auf ROH-Basis und das Gewicht inkl. Knochen/Schale an. Salz, Gewürze und nicht bezifferbare Kleinstmengen weglassen. Öl/Fett, das nur als Frittierbad dient, gehört NICHT in die Liste.

Denke kurz Schritt für Schritt nach und rufe danach finalize mit allen Zutaten auf."""

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
    for _ in range(4):
        msg = client.messages.create(model=MODEL, max_tokens=4096, system=SYSTEM,
                                     tools=[FINALIZE_TOOL], tool_choice={"type": "auto"}, messages=messages)
        in_tok += msg.usage.input_tokens; out_tok += msg.usage.output_tokens
        tu = next((b for b in msg.content if b.type == "tool_use"), None)
        if tu:
            return compute(tu.input.get("line_items", [])), in_tok, out_tok
        messages.append({"role": "assistant", "content": msg.content})
        messages.append({"role": "user", "content": "Bitte rufe jetzt finalize mit allen Zutaten auf."})
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
    print(f"\n=== Experiment 7: LLM grams + per-100g; deterministic transforms only ===")
    print(f"dataset: {EVAL_SET.name}")
    print(f"{'macro':10} {'MAPE%':>7} {'bias%':>7} {'Acc@20%':>8}")
    for m in MACROS:
        print(f"{m:10} {mape(m):7.1f} {bias(m):+7.1f} {acc20(m):8.0f}")
    print(f"\nrecipes={len(errs['kcal'])}  in_tok={in_tok}  out_tok={out_tok}  cost=${cost:.4f}")

if __name__ == "__main__":
    main()
