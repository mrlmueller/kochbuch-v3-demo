#!/usr/bin/env python3
"""
Experiment 8 — LLM does ALL the reasoning; code only sums (no transforms at all).

exp6/exp7 showed code-side machinery either hurts (USDA matching, piece tables) or
washes out and double-counts (cooking transforms). So exp8 strips code down to a
pure summation and pushes every judgment — realistic amounts, inedible/bone removal,
absorbed frying oil, rendered/drained fat, dry vs cooked weight, fat-level
qualifiers — into the LLM, where the edge cases actually live. Auditability is kept:
the model emits per-ingredient {grams, per_100g}; code multiplies and sums (so there
are no LLM arithmetic errors either). Everything in the prompt is GENERIC.

Run:  python backend/cmd/nutrition-eval/_experiments/exp8_llm_only.py [dataset.json]
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

def compute(line_items):
    """The ONLY deterministic step: grams x per_100g / 100, summed."""
    total = {k: 0.0 for k in MACROS}
    for li in line_items:
        g = li.get("grams") or 0
        if g <= 0:
            continue
        m = li.get("per_100g") or {}
        for k in MACROS:
            total[k] += float(m.get(k, 0) or 0) * g / 100.0
    return total

FINALIZE_TOOL = {"name": "finalize",
    "description": "Übergibt die Zutaten mit Gramm und Nährwerten pro 100 g. Die Gesamtsumme wird daraus automatisch berechnet — summiere NICHT selbst.",
    "input_schema": {"type": "object", "properties": {"line_items": {"type": "array", "items": {
        "type": "object", "properties": {
            "ingredient": {"type": "string", "description": "Name der Zutat, z.B. aufgenommenes Bratoel."},
            "grams": {"type": "number", "description": "Gramm dieser Zutat, die TATSÄCHLICH im fertigen Gericht gegessen werden (essbarer Anteil, ganzes Rezept)."},
            "per_100g": {"type": "object",
                "properties": {m: {"type": "number"} for m in MACROS}, "required": MACROS}},
        "required": ["ingredient", "grams", "per_100g"]}}},
        "required": ["line_items"]}}

SYSTEM = """Du bist Ernährungsexperte und schätzt die Gesamt-Nährwerte eines GANZEN Rezepts (Summe über ALLE Portionen, nicht pro Portion). Arbeite Zutat für Zutat und denke die Zubereitung mit — die Kalorien (kcal) sind am wichtigsten.

Gib für JEDE essbare Zutat zwei Dinge an:

1) grams — wie viele Gramm dieser Zutat am Ende WIRKLICH GEGESSEN werden (ganzes Rezept):
   • Haushaltsmaße/Stückzahlen realistisch in Gramm umrechnen. Anhaltspunkte: 1 EL Öl ≈ 14 g, 1 EL ≈ 15 g, 1 TL ≈ 5 g, 1 Tasse Mehl ≈ 120 g, 1 Ei ≈ 55 g, 1 Zwiebel ≈ 110 g, 1 Knoblauchzehe ≈ 3 g, 1 Tomate ≈ 110 g, 1 Paprika ≈ 120 g, 1 Karotte ≈ 80 g, 1 mittelgroße Kartoffel ≈ 120 g, ein Frühlingsrollen-/Reispapierblatt ≈ 10–12 g, ein Lasagneblatt ≈ 15 g, eine Scheibe Brot/Toast ≈ 30 g, ein Brötchen ≈ 60 g.
   • Nur die TATSÄCHLICH verwendete Menge zählen — nicht die ganze Packung/alle Blätter, wenn für die Füll-/Teigmenge weniger realistisch ist.
   • NICHT-Essbares abziehen: Knochen, Schale, Kerne, Strunk. Faustregeln: Geflügel mit Knochen ≈ 65 % essbares Fleisch, Spareribs/Kotelett mit Knochen ≈ 60 %, Garnelen mit Schale ≈ 50 %.
   • Nudeln, Reis, Hülsenfrüchte: TROCKENgewicht angeben (Wasseraufnahme beim Kochen ändert die Kalorien NICHT). Gemüse/Fleisch: rohes Gewicht.

2) per_100g — kcal, Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe pro 100 g GENAU dieser Zutat, passend zur oben gewählten Gramm-Basis (i.d.R. roh / wie eingekauft):
   • Sorten-/Fettangaben beachten: „fettarm", „mager", „light", „10 % Fett", „Vollfett", „Vollmilch", „1,5 %", Sahne vs. saure Sahne usw. — wähle die Werte passend, nicht pauschal die Vollfett-Variante.
   • Trocken vs. frisch beachten (z.B. getrocknete vs. frische Kräuter, Trockenhefe).

Zubereitung mitdenken (wichtig für die Kalorien):
   • Bratöl/-fett, das im Gericht BLEIBT und mitgegessen wird, zählt. Ist es nicht schon als Zutat gelistet, füge eine EIGENE Zeile „aufgenommenes Bratöl/-fett" mit realistischer Grammzahl hinzu (Paniertes/Frittiertes nimmt viel auf; kurz in wenig Öl Gebratenes wenig; im Airfryer/ohne Öl praktisch nichts).
   • Reines FRITTIERBAD-Öl, das nur zum Erhitzen dient und NICHT mitgegessen wird (z.B. „Öl zum Frittieren"), NICHT als Zutat zählen — nur den aufgenommenen Anteil.
   • Fett, das VERLOREN geht (abgegossenes Bratfett, ausgelassener Speck, beim Kochen abgeschöpftes/im Sud verworfenes Fett), berücksichtigen: dann weniger Gramm oder einen mageren per_100g-Wert wählen.

Weglassen: Salz, Gewürze, Wasser/Brühe ohne nennenswerte Kalorien und nicht bezifferbare Kleinstmengen.

Die Summe wird AUTOMATISCH aus deinen Zeilen berechnet — du musst nicht selbst rechnen oder summieren. Denke kurz Schritt für Schritt und rufe dann finalize mit allen Zutaten auf."""

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
    def acc(m, t): return 100 * sum(1 for x in errs[m] if abs(x) <= t) / len(errs[m])
    cost = in_tok * PRICE["in"] / 1e6 + out_tok * PRICE["out"] / 1e6
    print(f"\n=== Experiment 8: LLM-only (grams + per-100g); code only sums ===")
    print(f"dataset: {EVAL_SET.name}")
    print(f"{'macro':10} {'MAPE%':>7} {'bias%':>7} {'Acc@10%':>8} {'Acc@20%':>8}")
    for m in MACROS:
        print(f"{m:10} {mape(m):7.1f} {bias(m):+7.1f} {acc(m,10):8.0f} {acc(m,20):8.0f}")
    print(f"\nrecipes={len(errs['kcal'])}  in_tok={in_tok}  out_tok={out_tok}  cost=${cost:.4f}")

if __name__ == "__main__":
    main()
