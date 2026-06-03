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

## Seeds for the production build
- The prototype's `UNIT_ML / PIECE_G / PACK_G / EDIBLE / FAT_UPTAKE / fat-rendering`
  tables (`_experiments/exp5_deterministic.py`) → seed for **M3** `cooking_factors` +
  the unit table.
- The 14-recipe `recipes.json` + scoring (MAE/MAPE/Acc@±20/bias) → the **Go
  `cmd/nutrition-eval`** harness to port from the Python prototypes.
- M2: BLS 4.0 ingestion + `ingredient_aliases` (curated, Claude-bootstrapped) +
  amount→grams; M3: the cooking-transform tables above; then re-run this eval and
  watch carbs/sugar/fibre + variance close.
