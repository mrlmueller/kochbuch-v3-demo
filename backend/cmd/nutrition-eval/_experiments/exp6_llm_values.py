#!/usr/bin/env python3
"""
Experiment 6 — LLM-supplied per-100g values + deterministic amounts/transforms.

The external set proved that USDA food-matching HURTS when ingredient qualifiers
matter (fettarm/mager/10% -> full-fat mismatch), while the LLM's own per-100g
knowledge respects them. So exp6 drops USDA entirely:

  the LLM RESOLVES each ingredient -> {per_100g macros (qualifier-aware, raw basis),
      structured amount (value+unit), food_class, cooking method}
  deterministic CODE does -> amount->grams (unit/piece/pack), edible/bone fraction,
      frying-oil uptake, fat rendering, and the sum.

The LLM never gives grams, oil, or totals — only per-100g values + structured
amounts. This keeps exp3's qualifier-awareness, adds exp5's vague-amount handling,
and is auditable (every ingredient shows grams x per-100g). All prompts GENERIC.

Run:  python backend/cmd/nutrition-eval/_experiments/exp6_llm_values.py [dataset.json]
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

# ---- deterministic tables (identical to exp5; the LLM supplies per-100g only) -
UNIT_ML = {"ml": 1, "l": 1000, "EL": 15, "TL": 5, "Tasse": 240}
PIECE_G = {"onion": 110, "tomato": 110, "aubergine": 275, "egg": 53, "egg_yolk": 18,
           "corn_cob": 110, "garlic_clove": 4, "apple": 150, "potato": 150,
           "tortilla": 64, "sausage": 100, "default": 100}
PACK_G = {"pasta": 500, "spaetzle": 500, "default": 500}
EDIBLE = {"pork_ribs": 0.60, "chicken_whole": 0.65, "default": 1.0}
FAT_UPTAKE = {"deepfry": 5, "deepfry_breaded": 6, "panfry_breaded": 6, "deepfry_dough": 7}
MEAT = {"ground_meat", "pork", "pork_ribs", "chicken", "chicken_whole", "beef", "sausage", "lamb"}
FOOD_CLASSES = ["oil", "butter", "flour", "sugar", "egg", "egg_yolk", "milk", "cream", "cheese",
                "cream_cheese", "creme_fraiche", "yogurt", "potato", "onion", "tomato", "aubergine",
                "garlic_clove", "corn_cob", "apple", "pasta", "spaetzle", "rice", "breadcrumbs",
                "ground_meat", "pork", "pork_ribs", "chicken", "chicken_whole", "fish", "shrimp",
                "salmon", "tofu", "sausage", "beans", "nuts", "tortilla", "honey", "jam", "sauce",
                "vegetable", "fruit", "other"]
UNITS = ["g", "kg", "ml", "l", "EL", "TL", "Tasse", "Stück", "Packung", "Dose", "Zehe", "Bund", "Prise", "nach_Bedarf"]
METHODS = ["raw", "boil", "simmer", "steam", "panfry", "panfry_breaded", "deepfry",
           "deepfry_breaded", "deepfry_dough", "bake", "roast", "grill"]

def to_grams(v, unit, fc):
    if v is None: return 0.0
    if unit == "g": return v
    if unit == "kg": return v * 1000
    if unit in UNIT_ML:
        dens = 0.92 if fc == "oil" else (1.03 if fc in ("milk", "cream", "creme_fraiche", "yogurt") else 1.0)
        return v * UNIT_ML[unit] * dens
    if unit == "Stück": return v * PIECE_G.get(fc, PIECE_G["default"])
    if unit == "Packung": return v * PACK_G.get(fc, PACK_G["default"])
    if unit == "Dose": return v * 400
    if unit == "Zehe": return v * 4
    if unit == "Bund": return v * 25
    return 0.0

def compute(line_items):
    total = {k: 0.0 for k in MACROS}
    for li in line_items:
        m = li.get("per_100g") or {}
        fc, method = li.get("food_class", "other"), li.get("method", "raw")
        if fc == "oil" and method in ("deepfry", "deepfry_breaded", "deepfry_dough"):
            continue  # frying-bath oil is not eaten; only absorbed uptake counts
        g = to_grams(li.get("amount_value"), li.get("amount_unit"), fc) * EDIBLE.get(fc, 1.0)
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
    "description": "Übergibt die aufgelösten Zutaten. Umrechnung in Gramm, Knochenabzug, Bratöl-Aufnahme und Fettverlust werden AUTOMATISCH berechnet — schätze diese NICHT.",
    "input_schema": {"type": "object", "properties": {"line_items": {"type": "array", "items": {
        "type": "object", "properties": {
            "ingredient": {"type": "string"},
            "per_100g": {"type": "object",
                "description": "Nährwerte pro 100 g dieser Zutat (roh/wie eingekauft), passend zur Sorte/Fettstufe.",
                "properties": {m: {"type": "number"} for m in MACROS}, "required": MACROS},
            "amount_value": {"type": "number"},
            "amount_unit": {"type": "string", "enum": UNITS},
            "food_class": {"type": "string", "enum": FOOD_CLASSES},
            "method": {"type": "string", "enum": METHODS}},
        "required": ["ingredient", "per_100g", "amount_value", "amount_unit", "food_class", "method"]}}},
        "required": ["line_items"]}}

SYSTEM = """Du bist ein Ernährungsexperte und schätzt die Gesamt-Nährwerte eines Rezepts (Summe über alle Portionen).

Für JEDE essbare Zutat:
1. Bestimme die Nährwerte PRO 100 g (kcal, Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe) für GENAU diese Zutat. Berücksichtige Angaben wie „fettarm", „mager", „Vollfett", „10 % Fett", die Sorte und ob roh/getrocknet — gib typische Werte pro 100 g auf ROH-Basis (wie eingekauft) an.
2. Gib die Menge STRUKTURIERT an: amount_value (Zahl) + amount_unit. Rechne NICHT selbst in Gramm um — gib die Originaleinheit an (z.B. „2 EL" -> 2, „EL"; „1,5 kg" -> 1.5, „kg"; „2 Auberginen" -> 2, „Stück"; „eine Packung" -> 1, „Packung").
3. Gib food_class und method (Garmethode laut Zubereitungsschritten) an.

WICHTIG: Umrechnung in Gramm, Abzug von Knochen/Schale, aufgenommenes Bratöl beim Frittieren und Fettverlust beim Braten/Auslassen werden AUTOMATISCH und einheitlich berechnet. Mach das NICHT selbst — gib die Nährwerte pro 100 g auf ROH-Basis an. Salz, Gewürze und nicht bezifferbare Kleinstmengen kannst du weglassen. Öl/Fett, das nur als Frittierbad dient, gehört NICHT in die Zutatenliste.

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
    print(f"\n=== Experiment 6: LLM per-100g values + deterministic amounts/transforms (no USDA) ===")
    print(f"dataset: {EVAL_SET.name}")
    print(f"{'macro':10} {'MAPE%':>7} {'bias%':>7} {'Acc@20%':>8}")
    for m in MACROS:
        print(f"{m:10} {mape(m):7.1f} {bias(m):+7.1f} {acc20(m):8.0f}")
    print(f"\nrecipes={len(errs['kcal'])}  in_tok={in_tok}  out_tok={out_tok}  cost=${cost:.4f}")

if __name__ == "__main__":
    main()
