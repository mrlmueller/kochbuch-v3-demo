#!/usr/bin/env python3
"""
Experiment 1 — the deliberately NAIVE pure-LLM baseline.

One Claude call per recipe: a simple, fully GENERIC prompt (no recipe-specific
hints, ever) + a forced submit_nutrition tool. Forcing the tool means no
chain-of-thought — that is intentional; this is the floor we improve on. Scores
per-recipe totals against the hand-built ground truth (recipes.json).

Run:  python backend/cmd/nutrition-eval/_experiments/exp1_baseline.py
"""
import json, pathlib, time
import anthropic

HERE = pathlib.Path(__file__).resolve().parent
EVAL_SET = HERE.parent / "recipes.json"
ENV = HERE.parents[2] / ".env"        # backend/.env
MODEL = "claude-sonnet-4-6"
PRICE = {"in": 3.0, "out": 15.0}      # USD / 1M tokens (Sonnet 4.6)
MACROS = ["kcal", "protein_g", "fat_g", "carbs_g", "sugar_g", "fibre_g"]

def api_key():
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith("ANTHROPIC_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("ANTHROPIC_API_KEY not found in backend/.env")

# --- GENERIC prompt — universal, nothing tied to our test recipes -------------
SYSTEM = """Du bist ein Ernährungsexperte. Du bekommst ein Rezept (Titel, Anzahl Portionen, Zutaten mit Mengenangaben). Schätze die Nährwerte für das GESAMTE Rezept (Summe über alle Portionen, NICHT pro Portion).

Schätze für das gesamte Rezept:
- kcal: Kalorien
- protein_g: Eiweiß in Gramm
- fat_g: Fett in Gramm
- carbs_g: Kohlenhydrate in Gramm
- sugar_g: davon Zucker in Gramm
- fibre_g: Ballaststoffe in Gramm

Berücksichtige die tatsächlich verzehrten Mengen. Gib deine Schätzung ausschließlich über das Tool submit_nutrition ab."""

TOOL = {
    "name": "submit_nutrition",
    "description": "Speichert die geschätzten Gesamt-Nährwerte des Rezepts.",
    "input_schema": {
        "type": "object",
        "properties": {m: {"type": "number"} for m in MACROS},
        "required": MACROS,
    },
}

def recipe_text(r):
    out = [f"Titel: {r['title']}", f"Portionen: {r['servings']}", "", "Zutaten:"]
    for ing in r["ingredients"]:
        amt = ing["amount"].strip()
        out.append(f"- {amt} {ing['name']}".strip())
    return "\n".join(out)

def estimate(client, r):
    msg = client.messages.create(
        model=MODEL, max_tokens=1024, system=SYSTEM,
        tools=[TOOL], tool_choice={"type": "tool", "name": "submit_nutrition"},
        messages=[{"role": "user", "content": recipe_text(r)}],
    )
    block = next(b for b in msg.content if b.type == "tool_use")
    return block.input, msg.usage.input_tokens, msg.usage.output_tokens

def main():
    client = anthropic.Anthropic(api_key=api_key())
    recipes = json.loads(EVAL_SET.read_text(encoding="utf-8"))

    rows, errs = [], {m: [] for m in MACROS}        # errs[m] = list of signed %err
    in_tok = out_tok = 0
    for r in recipes:
        ref = r["reference"]["per_recipe"]
        for attempt in range(3):
            try:
                est, it, ot = estimate(client, r); break
            except Exception as e:
                print(f"  retry {r['id']}: {e}"); time.sleep(2)
        else:
            print(f"  FAILED {r['id']}"); continue
        in_tok += it; out_tok += ot
        kpe = (est["kcal"] - ref["kcal"]) / ref["kcal"] * 100
        rows.append((r["title"], est["kcal"], ref["kcal"], kpe))
        for m in MACROS:
            if ref[m] > 0:
                errs[m].append((est[m] - ref[m]) / ref[m] * 100)
        print(f"  {r['title'][:34]:34} kcal {est['kcal']:6.0f} vs {ref['kcal']:6.0f}  ({kpe:+5.0f}%)")

    def mape(m): return sum(abs(x) for x in errs[m]) / len(errs[m])
    def bias(m): return sum(errs[m]) / len(errs[m])
    def acc20(m): return 100 * sum(1 for x in errs[m] if abs(x) <= 20) / len(errs[m])

    cost = in_tok * PRICE["in"] / 1e6 + out_tok * PRICE["out"] / 1e6
    print("\n=== Experiment 1: naive pure-LLM baseline (claude-sonnet-4-6) ===")
    print(f"{'macro':10} {'MAPE%':>7} {'bias%':>7} {'Acc@20%':>8}")
    for m in MACROS:
        print(f"{m:10} {mape(m):7.1f} {bias(m):+7.1f} {acc20(m):8.0f}")
    print(f"\nrecipes={len(rows)}  in_tok={in_tok}  out_tok={out_tok}  cost=${cost:.4f}")
    print("(kcal is the keystone metric; research predicts ~30%+ underestimation for naive LLM)")

if __name__ == "__main__":
    main()
