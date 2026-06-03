# Nutrition eval — experiment results & validated architecture (M1)

Date: 2026-06-03. Eval-first, measured on the 14-recipe hand-built ground truth
(`backend/cmd/nutrition-eval/recipes.json`, scored per-recipe totals). Model:
`claude-sonnet-4-6`. Scripts: `_experiments/exp1..5`. Total API spend ≈ $3.

## The arc (kcal = keystone)

| # | change | kcal MAPE | kcal Acc@±20 | cost |
|---|---|--:|--:|--:|
| 1 | naive pure-LLM, forced tool (no reasoning) | 21.6 | 50% | $0.07 |
| 2 | + chain-of-thought | 16.0 | 71% | $0.28 |
| 3 | + recipe steps | 15.1 | 79% | $0.29 |
| 4 | + USDA FDC food-search (LLM-guessed grams) | 19.9 | 79% | $0.73 |
| 5 | **+ deterministic grams + cooking transforms** | **14.8** | **86%** | $0.81 |

Per-macro best (exp5): **kcal 14.8 / 86**, **protein 10.1 / 86**, **fat 12.5 / 79**.
carbs/sugar/fibre stayed noisy (sugar MAPE 62%).

## Conclusions

1. **Pure-LLM plateaus** at ~15% kcal MAPE. CoT and the recipe **steps** are the cheap,
   real levers (50% → 79% within ±20%).
2. **A food-DB *bolt-on* does NOT help** (exp4): if the LLM still guesses grams + oil,
   real per-100g values don't move the keystone, and bad matches get amplified.
3. **Deterministic amount→grams + cooking transforms IS the win** (exp5): table-driven
   unit/piece/pack → grams, bone/edible fraction, frying-oil uptake (Bognár), and
   fat-rendering drains produced the best kcal/protein/fat by a clear margin. The
   LLM's job shrinks to *resolve + classify* (food match, structured amount,
   food_class, cooking method); code does everything quantitative.
4. **The two remaining error sources are exactly what production fixes:**
   - **LLM-resolution variance** — same recipe, different run, different match → a big
     outlier (Amerikaner +2% → +89% between runs). Fix: a **curated/cached
     `ingredient_aliases` table** (deterministic German-name→food matching; freeze
     resolutions). This is M2.
   - **USDA sugar/fibre gaps + thin German coverage** — Foundation foods often report
     0/missing sugar & fibre; German items (Schmand, Spätzle, Hackfleisch) match poorly.
     Fix: **BLS 4.0** (German, complete per-100g incl. sugar/fibre). This is M2.
5. **A real frying bug the eval caught:** the model listed the deep-fry *bath* oil as a
   consumed ingredient (Schnitzel → +543%). Generic fix: bath oil is never an
   ingredient; only the table-computed uptake counts. Kept in the prompt + a code guard.

## Validated architecture (what to build)

```
confirmed recipe (ingredients + amounts + steps + servings)
  → [LLM: resolve + classify]  per ingredient → {food match (curated alias→BLS),
        structured amount (value+unit), food_class, cooking method}
  → [deterministic code]  amount→grams (unit/piece/pack/density tables)
        · edible fraction (bone/shell)  · frying-oil uptake  · fat rendering
        · per-100g macros from BLS/USDA  · sum  → per-recipe totals
  → ÷ servings for display
```

The LLM never invents a nutrient value or a gram amount. Matching is frozen in a
curated table (deterministic, auditable), so the same recipe always yields the same
numbers. This is the research's Architecture B, now proven on our own recipes.

## Eval set expanded 14 → 29 (held-out generalization check)

To make the production gate trustworthy and test for over-fitting, the ground truth
was grown from 14 to **29 recipes**, adding coverage the first set lacked: more
deep-frying (Fried Chicken, Frühlingsrollen), stews/soups (Chili con Carne, Gulasch,
Brokkolicremesuppe), a baked composite (Lasagne), legumes/fibre (kidney beans), rice
(Sushi-Reis), fresh/raw (Sommerrollen), salads (Kartoffelsalat), simple bakes, dumplings,
pancakes, a cream-sauce sauté, and a meat-in-bread snack. ~35 new per-100g values were
looked up (German/composite items web-verified: Leberkäse, Räuchertofu, Glasnudeln,
Tomatenmark, kidney beans, whole-chicken bone fraction, stew meat, Weizenbrötchen).

Reproducibility: `groundtruth_compute.py` now pulls the real ingredient lines **and**
steps from a committed `_db_source.json` (keyed by recipe id), so the entire set
regenerates in one run. Every recipe's **Atwater self-check is ≤11% (mostly ≤3%)**,
confirming the macro table is internally consistent across all 29.

The 15 new recipes are **held out** from the exp1–5 tuning, so re-running the deterministic
estimator (exp5) on them is a direct over-fitting test: if the table-driven approach was
tuned to the original 14, accuracy will drop on the unseen 15. That run is the next gate.

## Independent external set (15 recipes) — generalization + a course-correction

A second ground-truth set was added from a German recipe app
(`recipes_external.json`, built by `external_build.py`). Its nutrient values were
computed by a **third party**, not by us — so it has none of the circularity of our
hand-computed `recipes.json`. Each recipe gives exact gram amounts, a portion count,
steps, and a per-portion table for all six macros; `per_recipe = per_portion ×
servings`. Transcription QA: every Atwater self-check ≤7%.

Both estimators were run against it (same `claude-sonnet-4-6`):

| estimator (external set) | kcal MAPE / Acc@±20 | protein | fat | carbs |
|---|--:|--:|--:|--:|
| exp5 deterministic **+ USDA FDC** | 15.4 / 80 | 15.7 | 36.5 | 42.7 |
| exp3 **pure-LLM** (CoT + steps)   | **7.1 / 93** | 12.2 | **20.0** | **22.2** |

**Findings:**
1. **kcal generalizes — not overfit.** exp5's kcal on independent data (15.4 / 80) is
   essentially its number on our own set (14.8 / 86). The headline holds on data we
   didn't make.
2. **With grams given, pure-LLM >> USDA-augmented.** exp3 hits 7.1% kcal MAPE / 93%
   here. Two reasons: (a) the external recipes already give grams, so the deterministic
   amount→grams layer (exp5's main lever) buys nothing; (b) the USDA food-search
   **cannot honor "fettarm / mager / 10% Fett" qualifiers** and grabs full-fat matches,
   so exp5's fat over-counts (**bias +26%**) and carbs over-count (**bias +43%**).
   Tomaten-Mozzarella (250 g *low-fat* mozzarella) is the extreme: exp5 +134%, exp3 +54%.
3. **Course-correction (caught before building):** a generic USDA-FDC *matching* layer
   is a **net negative** when ingredient qualifiers matter — which is most real recipes.
   exp4 already hinted at this on our set; the external set makes it unambiguous.

**Refined production design (updated by this evidence):**
- **Keep** the LLM as resolver/classifier: structured amount (value+unit), food_class,
  cooking method — **and the fat-level/variant qualifier** (fettarm, mager, 10 %).
- **Keep** deterministic amount→grams + cooking transforms — they are the lever for
  **vague-amount** recipes (our real data: free-text servings + amounts). The external
  set can't test this because it already gives grams.
- **Change** where per-100g values come from: **not** a generic USDA top-1 search.
  Use a **German, variant-aware** source (BLS, which carries fettarm/mager variants)
  via **curated matching** that honors the qualifier — or let the LLM supply the
  per-100g value (it's accurate and qualifier-aware) and use the DB to freeze/audit it.
  The eval gate to beat is now **exp3's 7.1 % kcal** on the external set and **~15 %**
  on the vague-amount set.

## Full estimator × dataset matrix + final architecture (exp6, exp7)

Two more estimators isolated *where* determinism helps vs hurts. kcal MAPE / Acc@±20:

| estimator | our set (vague amts, 29) | external (grams given, 15) |
|---|--:|--:|
| exp3 pure-LLM (CoT+steps, totals)                 | 13.2 / 72 | 7.1 / 93 |
| exp6 LLM per-100g + determ **amount-table** + transforms | 39.5 / 59 | 6.7 / 93 |
| exp7 LLM **grams** + per-100g + determ transforms only   | 14.1 / 76 | 5.6 / 93 |
| **exp8 LLM-only (grams + per-100g; code ONLY sums)**     | **10.7 / 79** | 7.6 / 93 |

Findings:
- **Deterministic piece/pack amount tables are brittle** (exp6, our set 39.5 %): "40
  Stück" wrappers × 100 g default = 4 kg → +310 %. The same recipes are fine under
  exp3/exp7 because the LLM knows realistic piece weights + usage. → the LLM should own
  amount→grams. The **expanded eval set is what exposed this** (the original 14 only had
  table-covered pieces) — and it **supersedes exp5's "deterministic amount→grams is the
  lever,"** which was an artifact of the narrow 14-set.
- **Deterministic cooking transforms are a wash** (exp7 vs exp3, our set 14.1 vs 13.2):
  they fix the LLM's over-counts on rendered/fried/bone dishes (Spareribs +49→+5,
  Schnitzel +24→+12) but double-count when the LLM's per-100g already reflects cooking
  (Fried Chicken +20→+51, Mais +46→+104). Net-neutral on kcal — keep only the
  unambiguous ones (exclude frying-bath oil; bone fraction for whole birds/ribs).
- **Auditable line items cost nothing**: the LLM emits per-ingredient grams + per-100g;
  code sums — every ingredient's contribution is inspectable and freezable.
- **Removing the transforms entirely wins** (exp8): once the prompt tells the LLM to do
  the cooking reasoning itself (edible/bone removal, absorbed frying oil as its own
  line, drained/rendered fat, dry-weight for pasta/rice, fat-level qualifiers), code
  shrinks to a pure sum and kcal on the vague-amount set improves to **10.7 % / 79 %**
  — the best of any config, with the transform double-counts gone (Fried Chicken
  +51→+25, Mais +104→+49). Code-summation also removes the LLM's own arithmetic error.

**Final architecture (evidence-locked — exp8):**
```
LLM resolves each ingredient -> { grams (realistic, edible-only, dry-weight for
    pasta/rice), per_100g (qualifier-aware) }   + a line for absorbed cooking oil
deterministic code -> Σ grams × per_100g / 100   (nothing else); ÷ servings for display
```
No USDA matching (hurts on qualifiers). No piece/pack gram tables (brittle). No code
transforms (the LLM handles bone/oil/rendering via a comprehensive GENERIC prompt). The
LLM + CoT + recipe **steps** is the engine; code only sums (auditable, no arithmetic
error). Gate to hold in production: **kcal ≤ ~11 % MAPE / ~80 % within ±20 % on
vague-amount recipes, ≤ ~8 % when grams are given**, near-zero bias. Sugar/fibre stay
weakest (~20–36 % MAPE → secondary display, show uncertainty). Eval spend ≈ $8.

## Optional reviewer/critic pass (exp9)

A second GENERIC "critic" LLM (sees the recipe + stage-1 line items + the per-recipe
AND per-serving totals; revises only values it can justify as clearly unrealistic,
leaves plausible ones alone) was A/B'd against exp8 on the **same** stage-1 estimates
(our 29-set):

| kcal | stage-1 (exp8) | + reviewer |
|---|--:|--:|
| MAPE | 10.5 % | **8.7 %** |
| within ±20 % | 83 % | **86 %** |
| bias | +3.3 % | **+0.6 %** |

Also improved protein (11.0→9.7) / carbs (14.3→12.2) / fibre (22.4→20.5); fat and
sugar ~flat. It fixed real over-counts (Spareribs +38→+18, Mais +41→+26, Schnitzel
+14→+10, Lachscreme −16→−8) but **occasionally overcorrected** (Bolognese +31→−20,
Kartoffelsalat −7→−21) — the predicted "a second estimate can regress a good one" risk.

Verdict: a **real but modest** kcal gain plus near-zero bias, at **2× API calls**.
Because nutrition is computed **once per recipe and cached** (not per view), the cost is
acceptable — worth keeping as an **optional refine stage**, ideally a *conservative*
reviewer (touch only clear outliers, small nudges) to avoid the overcorrections.
External-set confirmation not yet run (budget).

## Seeds for the production build
- The prototype's `UNIT_ML / PIECE_G / PACK_G / EDIBLE / FAT_UPTAKE / fat-rendering`
  tables (`_experiments/exp5_deterministic.py`) → seed for **M3** `cooking_factors` +
  the unit table.
- The 14-recipe `recipes.json` + scoring (MAE/MAPE/Acc@±20/bias) → the **Go
  `cmd/nutrition-eval`** harness to port from the Python prototypes.
- M2: BLS 4.0 ingestion + `ingredient_aliases` (curated, Claude-bootstrapped) +
  amount→grams; M3: the cooking-transform tables above; then re-run this eval and
  watch carbs/sugar/fibre + variance close.
