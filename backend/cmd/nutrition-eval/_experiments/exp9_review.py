#!/usr/bin/env python3
"""
Experiment 9 — does a second "reviewer" agent help? (measured, not assumed)

Stage 1 = exp8 (LLM emits {grams, per_100g} per ingredient; code sums).
Stage 2 = a GENERIC critic LLM sees the recipe + stage-1 line items + the resulting
per-recipe AND per-serving totals, and revises ONLY values it can justify as clearly
unrealistic (realistic piece weights, edible portion, dry weight, fat-level qualifier,
and a sane per-serving kcal for that kind of dish). Plausible values are left alone.

To isolate the reviewer's effect, exp9 scores BOTH the pre-review (stage 1) and the
post-review totals on the SAME stage-1 outputs and prints them side by side. If the
critic doesn't beat stage 1, it's just latency — and we drop it. All prompts GENERIC.

Run:  python backend/cmd/nutrition-eval/_experiments/exp9_review.py [dataset.json]
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
    total = {k: 0.0 for k in MACROS}
    for li in line_items:
        g = li.get("grams") or 0
        if g <= 0: continue
        m = li.get("per_100g") or {}
        for k in MACROS:
            total[k] += float(m.get(k, 0) or 0) * g / 100.0
    return total

PER100 = {"type": "object", "properties": {m: {"type": "number"} for m in MACROS}, "required": MACROS}

# ---- Stage 1 (identical intent to exp8) --------------------------------------
FINALIZE_TOOL = {"name": "finalize",
    "description": "Übergibt die Zutaten mit Gramm und Nährwerten pro 100 g. Die Summe wird automatisch berechnet — summiere NICHT selbst.",
    "input_schema": {"type": "object", "properties": {"line_items": {"type": "array", "items": {
        "type": "object", "properties": {
            "ingredient": {"type": "string"},
            "grams": {"type": "number", "description": "Gramm, die tatsächlich gegessen werden (essbarer Anteil, ganzes Rezept)."},
            "per_100g": PER100},
        "required": ["ingredient", "grams", "per_100g"]}}},
        "required": ["line_items"]}}

SYSTEM1 = """Du bist Ernährungsexperte und schätzt die Gesamt-Nährwerte eines GANZEN Rezepts (Summe über ALLE Portionen). Arbeite Zutat für Zutat — die Kalorien sind am wichtigsten.

Gib je essbarer Zutat an:
1) grams — Gramm, die am Ende WIRKLICH gegessen werden (ganzes Rezept). Haushaltsmaße/Stückzahlen realistisch umrechnen (1 EL Öl ≈ 14 g, 1 TL ≈ 5 g, 1 Ei ≈ 55 g, 1 Zwiebel ≈ 110 g, 1 Knoblauchzehe ≈ 3 g, 1 Tomate ≈ 110 g, ein Frühlingsrollen-/Reispapierblatt ≈ 10–12 g, ein Lasagneblatt ≈ 15 g, ein Brötchen ≈ 60 g). Nur die tatsächlich verwendete Menge; Nicht-Essbares abziehen (Geflügel m. Knochen ≈ 65 %, Spareribs ≈ 60 %, Garnelen m. Schale ≈ 50 %); Nudeln/Reis/Hülsenfrüchte als TROCKENgewicht.
2) per_100g — kcal, Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe pro 100 g genau dieser Zutat; Sorten-/Fettangaben beachten (fettarm/mager/10 %/Vollfett).

Zubereitung: im Gericht bleibendes Bratöl als eigene Zeile „aufgenommenes Bratfett" mit realistischen Gramm; reines Frittierbad NICHT zählen; verlorenes/abgegossenes Fett abziehen. Salz/Gewürze/kalorienfreie Flüssigkeiten weglassen.

Die Summe wird automatisch berechnet. Denke kurz nach und rufe finalize auf."""

# ---- Stage 2 (the reviewer) --------------------------------------------------
REVIEW_TOOL = {"name": "submit_review",
    "description": "Gibt die geprüfte Zutatenliste zurück (plausible Zeilen unverändert; nur klar unrealistische korrigiert).",
    "input_schema": {"type": "object", "properties": {"line_items": {"type": "array", "items": {
        "type": "object", "properties": {
            "ingredient": {"type": "string"},
            "grams": {"type": "number"},
            "per_100g": PER100,
            "changed": {"type": "boolean"},
            "reason": {"type": "string", "description": "Kurze Begründung, falls geändert; sonst leer."}},
        "required": ["ingredient", "grams", "per_100g", "changed"]}}},
        "required": ["line_items"]}}

SYSTEM2 = """Du bist ein kritischer Prüfer für Nährwert-Schätzungen. Du bekommst ein Rezept und eine erste Schätzung: je Zutat Gramm + Werte pro 100 g, plus die berechneten Gesamtwerte UND die Werte pro Portion.

Prüfe nüchtern auf REALISMUS:
- Sind die Gramm-Mengen plausibel? (übliche Stückgewichte; nur tatsächlich verwendete Menge; essbarer Anteil ohne Knochen/Schale; Nudeln/Reis als Trockengewicht)
- Passen die Werte pro 100 g zur Zutat und zu Angaben wie „fettarm"/„mager"?
- Ist die Kalorienzahl PRO PORTION für diese Art Gericht realistisch (nicht offensichtlich zu hoch oder zu niedrig)?

Wichtig: Korrigiere NUR Zeilen, die KLAR unrealistisch sind, und setze dann changed=true mit kurzer Begründung. Plausible Werte unverändert lassen (changed=false). Verschiebe nichts „zur Sicherheit" Richtung Mittelwert — ein aufwändiges/fettiges Gericht DARF viele Kalorien haben. Nutze allgemeines Ernährungswissen, erfinde keine Scheingenauigkeit.

Rufe submit_review mit der vollständigen (ggf. korrigierten) Liste auf."""

def recipe_text(r):
    out = [f"Titel: {r['title']}", f"Portionen: {r['servings']}", "", "Zutaten:"]
    for ing in r["ingredients"]:
        out.append(f"- {ing['amount'].strip()} {ing['name']}".strip())
    if r.get("steps"):
        out += ["", "Zubereitung:"] + [f"{i}. {s}" for i, s in enumerate(r["steps"], 1)]
    return "\n".join(out)

def call(client, system, tools, messages):
    in_tok = out_tok = 0
    for _ in range(4):
        msg = client.messages.create(model=MODEL, max_tokens=4096, system=system,
                                     tools=tools, tool_choice={"type": "auto"}, messages=messages)
        in_tok += msg.usage.input_tokens; out_tok += msg.usage.output_tokens
        tu = next((b for b in msg.content if b.type == "tool_use"), None)
        if tu:
            return tu.input, in_tok, out_tok
        messages.append({"role": "assistant", "content": msg.content})
        messages.append({"role": "user", "content": "Bitte rufe jetzt das Tool auf."})
    raise RuntimeError("no tool call")

def servings_num(r):
    try: return float(str(r["servings"]).split()[0].replace(",", "."))
    except Exception: return 1.0

def estimate(client, r):
    # stage 1
    s1, i1, o1 = call(client, SYSTEM1, [FINALIZE_TOOL],
                      [{"role": "user", "content": recipe_text(r)}])
    items1 = s1.get("line_items", [])
    tot1 = compute(items1)
    # stage 2 (reviewer)
    n = servings_num(r)
    per_serv = {k: round(v / n, 1) for k, v in tot1.items()}
    payload = ("Rezept:\n" + recipe_text(r) +
               "\n\nErste Schätzung (Zutaten):\n" +
               json.dumps([{ "ingredient": x.get("ingredient"), "grams": x.get("grams"),
                             "per_100g": x.get("per_100g")} for x in items1], ensure_ascii=False, indent=1) +
               f"\n\nBerechnet — gesamtes Rezept: {{kcal {tot1['kcal']:.0f}, Eiweiß {tot1['protein_g']:.0f} g, Fett {tot1['fat_g']:.0f} g, KH {tot1['carbs_g']:.0f} g}}" +
               f"\nPro Portion ({r['servings']}): {{kcal {per_serv['kcal']:.0f}, Eiweiß {per_serv['protein_g']:.0f} g, Fett {per_serv['fat_g']:.0f} g}}")
    s2, i2, o2 = call(client, SYSTEM2, [REVIEW_TOOL], [{"role": "user", "content": payload}])
    items2 = s2.get("line_items", []) or items1
    tot2 = compute(items2)
    return tot1, tot2, i1 + i2, o1 + o2

def stats(errs):
    out = {}
    for m in MACROS:
        e = errs[m]
        out[m] = (sum(abs(x) for x in e)/len(e), sum(e)/len(e),
                  100*sum(1 for x in e if abs(x) <= 20)/len(e))
    return out

def main():
    client = anthropic.Anthropic(api_key=envval("ANTHROPIC_API_KEY"))
    recipes = json.loads(EVAL_SET.read_text(encoding="utf-8"))
    pre = {m: [] for m in MACROS}; post = {m: [] for m in MACROS}
    in_tok = out_tok = 0
    for r in recipes:
        ref = r["reference"]["per_recipe"]
        for _ in range(2):
            try: t1, t2, it, ot = estimate(client, r); break
            except Exception as e: print(f"  retry {r['id']}: {e}"); time.sleep(2)
        else: print(f"  FAILED {r['id']}"); continue
        in_tok += it; out_tok += ot
        for m in MACROS:
            if ref[m] > 0:
                pre[m].append((t1[m]-ref[m])/ref[m]*100); post[m].append((t2[m]-ref[m])/ref[m]*100)
        k1 = (t1["kcal"]-ref["kcal"])/ref["kcal"]*100; k2 = (t2["kcal"]-ref["kcal"])/ref["kcal"]*100
        moved = "" if abs(k2-k1) < 0.5 else f"  (review {k1:+.0f}->{k2:+.0f})"
        print(f"  {r['title'][:30]:30} kcal {t2['kcal']:6.0f} vs {ref['kcal']:6.0f}  ({k2:+5.0f}%){moved}")
    sp, sq = stats(pre), stats(post)
    cost = in_tok*PRICE["in"]/1e6 + out_tok*PRICE["out"]/1e6
    print(f"\n=== Experiment 9: stage-1 (exp8) vs +reviewer — dataset: {EVAL_SET.name} ===")
    print(f"{'macro':10} {'pre MAPE':>9} {'post MAPE':>10} {'pre Acc20':>10} {'post Acc20':>11} {'pre bias':>9} {'post bias':>10}")
    for m in MACROS:
        print(f"{m:10} {sp[m][0]:9.1f} {sq[m][0]:10.1f} {sp[m][2]:10.0f} {sq[m][2]:11.0f} {sp[m][1]:+9.1f} {sq[m][1]:+10.1f}")
    print(f"\nrecipes={len(pre['kcal'])}  cost=${cost:.4f}")

if __name__ == "__main__":
    main()
