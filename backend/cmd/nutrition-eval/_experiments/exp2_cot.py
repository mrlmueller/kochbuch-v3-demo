#!/usr/bin/env python3
"""
Experiment 2 — add chain-of-thought (the research's biggest single lever).

Same model/data as exp1, but tool_choice is now 'auto' so the model can reason
in text first, and the prompt asks it to decompose ingredient-by-ingredient and
reason about cooking GENERICALLY (oil uptake, draining, bone removal) before
calling submit_nutrition. NOTHING recipe-specific — universal cooking principles
only. We measure the delta vs the exp1 floor.

Run:  python backend/cmd/nutrition-eval/_experiments/exp2_cot.py
"""
import json, pathlib, time
import anthropic

HERE = pathlib.Path(__file__).resolve().parent
EVAL_SET = HERE.parent / "recipes.json"
ENV = HERE.parents[2] / ".env"
MODEL = "claude-sonnet-4-6"
PRICE = {"in": 3.0, "out": 15.0}
MACROS = ["kcal", "protein_g", "fat_g", "carbs_g", "sugar_g", "fibre_g"]

def api_key():
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith("ANTHROPIC_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("no key")

# --- GENERIC chain-of-thought prompt — universal cooking principles only ------
SYSTEM = """Du bist ein Ernährungsexperte. Du bekommst ein Rezept (Titel, Portionen, Zutaten mit Mengen) und schätzt die Nährwerte für das GESAMTE Rezept (Summe über alle Portionen, NICHT pro Portion).

Gehe sorgfältig Schritt für Schritt vor:
1. Gehe jede Zutat einzeln durch und schätze ihre Menge in Gramm. Rechne Haushaltsmaße um (EL ca. 15 g, TL ca. 5 g, Stück/Packung nach üblichem Gewicht). Nicht bezifferbare Kleinstmengen (Salz, Gewürze, "nach Bedarf") kannst du vernachlässigen.
2. Schätze für jede Zutat die Nährwerte anhand typischer Werte pro 100 g.
3. Berücksichtige die Zubereitung: Beim Braten/Frittieren wird Öl/Fett aufgenommen und muss hinzugerechnet werden (frittierte/panierte Speisen nehmen viel Fett auf); beim Abgießen oder Auslassen geht Fett verloren; nicht essbare Anteile (z.B. Knochen) zählen nicht mit; gekochte Beilagen (Nudeln, Reis) werden nach Trockengewicht gerechnet.
4. Summiere alle Zutaten zu den Gesamtwerten des Rezepts.

Erkläre deine Rechnung kurz und rufe danach das Tool submit_nutrition mit den Gesamtwerten auf."""

TOOL = {
    "name": "submit_nutrition",
    "description": "Speichert die geschätzten Gesamt-Nährwerte des Rezepts.",
    "input_schema": {"type": "object",
                     "properties": {m: {"type": "number"} for m in MACROS},
                     "required": MACROS},
}

def recipe_text(r):
    out = [f"Titel: {r['title']}", f"Portionen: {r['servings']}", "", "Zutaten:"]
    for ing in r["ingredients"]:
        out.append(f"- {ing['amount'].strip()} {ing['name']}".strip())
    return "\n".join(out)

def estimate(client, r):
    messages = [{"role": "user", "content": recipe_text(r)}]
    in_tok = out_tok = 0
    for _ in range(3):  # allow a follow-up nudge if it reasons but skips the tool
        msg = client.messages.create(
            model=MODEL, max_tokens=2048, system=SYSTEM,
            tools=[TOOL], tool_choice={"type": "auto"}, messages=messages,
        )
        in_tok += msg.usage.input_tokens; out_tok += msg.usage.output_tokens
        tu = next((b for b in msg.content if b.type == "tool_use"), None)
        if tu:
            return tu.input, in_tok, out_tok
        messages.append({"role": "assistant", "content": msg.content})
        messages.append({"role": "user", "content": "Bitte rufe jetzt submit_nutrition mit den Gesamtwerten auf."})
    raise RuntimeError("no tool call")

def main():
    client = anthropic.Anthropic(api_key=api_key())
    recipes = json.loads(EVAL_SET.read_text(encoding="utf-8"))
    errs = {m: [] for m in MACROS}
    in_tok = out_tok = 0
    for r in recipes:
        ref = r["reference"]["per_recipe"]
        for _ in range(3):
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
    print("\n=== Experiment 2: + chain-of-thought (claude-sonnet-4-6) ===")
    print(f"{'macro':10} {'MAPE%':>7} {'bias%':>7} {'Acc@20%':>8}   (exp1 kcal: MAPE 21.6 / Acc 50)")
    for m in MACROS:
        print(f"{m:10} {mape(m):7.1f} {bias(m):+7.1f} {acc20(m):8.0f}")
    print(f"\nrecipes={len(errs['kcal'])}  in_tok={in_tok}  out_tok={out_tok}  cost=${cost:.4f}")

if __name__ == "__main__":
    main()
