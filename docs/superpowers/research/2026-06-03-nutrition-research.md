# Nutrition estimation — research findings (Part 2)

Date: 2026-06-03. Synthesised from 4 parallel research agents (data sources,
cooking transforms, architecture, eval methodology). All four converged on the
same design independently.

## Headline decisions

1. **Data:** self-host **BLS 4.0** (German Bundeslebensmittelschlüssel) as the
   canonical ingredient table — free since Dec 2025 (CC BY 4.0), ~7,140 German
   foods/dishes × 138 nutrients, native German names, federal authority. Fallback:
   **USDA FoodData Central** (SR Legacy + Foundation Foods, CC0). Skip commercial
   APIs (Edamam/Nutritionix/Spoonacular/FatSecret) and Open Food Facts (crowd
   data + ODbL share-alike friction).
2. **Architecture:** **tool-augmented lookup → deterministic compute.** The LLM
   does only what it's good at (resolve a messy German ingredient phrase → a
   canonical food + grams). **Go code does every multiplication, sum, and cooking
   adjustment.** This is how Edamam/Spoonacular actually work. Pure-LLM estimation
   is biased (−36% kcal / −28% protein / −48% fat in studies) and non-deterministic.
3. **Cooking transforms:** **fat/oil absorption is the #1 error source** (ignoring
   fry-oil underestimates fried-food kcal by 100%+). Use the EuroFIR model: weight
   yield at dish level + retention at ingredient level. Build fat-absorption +
   weight-yield first; macro retention is a minor flat ~0.95.
4. **Eval:** a Go `cmd/nutrition-eval` mirroring `cmd/ai-eval`. Metrics: per-macro
   MAE + MAPE (per serving) + accuracy bands. Thresholds anchored to FDA label
   tolerance (±20%). Reference set: 30 → 60 recipes, ground-truthed by computing
   from BLS/USDA, treated as a ±10–20% band.

## 1. Data sources

| Source | Coverage | German | License | Download? | Use |
|---|---|---|---|---|---|
| **BLS 4.0** (Max Rubner-Institut) | ~7,140 raw + composite, German staples | native | CC BY 4.0 (attribution) | yes, `.xlsx` | **primary** |
| **USDA FoodData Central** (SR Legacy + Foundation) | ~7,793 generic | English | CC0 | yes, CSV/JSON | **fallback** |
| Open Food Facts | branded/crowd | DE products | ODbL share-alike | yes | avoid (legal friction) |
| Edamam / Nutritionix / Spoonacular / FatSecret | mixed | EN | proprietary, no bulk download | no | skip |

- **BLS license gotcha:** CC BY 4.0 → visible attribution required, e.g. *"Nährwerte
  basieren auf dem Bundeslebensmittelschlüssel (BLS) 4.0, © Max Rubner-Institut,
  CC BY 4.0"* (DOI 10.25826/Data20251217-134202-0).
- **German name → DB entry matching:** curated `ingredient_aliases` table
  (`german_name_normalized → bls_code`) is the source of truth (deterministic,
  auditable). Bootstrap it with Claude (pick best BLS row from a candidate
  shortlist); generate shortlists with Postgres `pg_trgm` (lexical) + multilingual
  embeddings via `pgvector` (semantic). Match within German (don't translate first;
  "Schmand" ≠ "sour cream"). Runtime = pure table lookup; only new ingredients hit
  the LLM.
- **Amount → grams** (adjacent but essential): German unit/density/piece-weight
  table (EL/TL/Tasse → ml → g; "1 Zwiebel ≈ 110 g"). Flag "nach Bedarf"/"etwas".
- URLs: BLS https://blsdb.de/download · https://www.mri.bund.de/ ·
  USDA https://fdc.nal.usda.gov/download-datasets/ ·
  matching research https://pmc.ncbi.nlm.nih.gov/articles/PMC7274754/

## 2. Cooking transforms

Model (EuroFIR / Reg. EU 1169/2011): per ingredient `i`, method `m`:
```
cooked_mass   = raw_mass × yield[class,m]
absorbed_fat_g = (raw_mass/100) × fat_uptake[class,m]     # capped at oil actually used
nutrient      = raw_per_g × raw_mass × retention[nutrient,m]
fat  += absorbed_fat_g ;  kcal += absorbed_fat_g × 9
per_serving   = Σ nutrient / servings
```
Component (A) vs total-dish (B) basis flag governs whether rendered/poured-off fat
counts (pan-fried meat → A, fat down; stew/sauce → B, fat stays).

**Priority:** P0 fat-uptake + weight-yield · P1 rendered-fat drain + dry-staple
water multiplier · P2 macro retention (flat ~0.95) · P3 discarded liquids (ignore
for macros).

**Fat uptake (g oil / 100 g raw), Bognár tables, by German method:**
fries/Pommes (frittieren) 5 · breaded schnitzel (braten) 6 · breaded chicken 5 ·
non-breaded meat fried ~1 · veg breaded/fried 5 · pancake/fried dough 7 ·
fried egg 5 / Rührei 10. Cap absorbed oil at the recipe's listed oil.

**Weight yield (cooked ÷ raw):** roast/fry meat 0.60–0.75 · boiled potato 1.0 ·
fries-from-raw 0.49–0.54 · **pasta ×2.1–2.5 · rice ×2.6–3.2** · boiled veg 0.9–1.05.

**Error if ignored:** fried potatoes underestimate kcal ~100–150% (≈45–55% of fries'
calories is absorbed oil); breaded schnitzel ~+80 kcal/+9 g fat per cutlet; sautéed
veg can double; macro retention only 0–10% → flat 0.95 fine.

**Best source: Bognár weight-yield + retention tables (German methods, explicit
oil-uptake grams), FAO PDF** — transcribe into Postgres once:
https://www.fao.org/uploads/media/bognar_bfe-r-02-03.pdf
Plus USDA retention R6 https://www.ars.usda.gov/arsuserfiles/80400530/pdf/retn06.pdf ·
USDA cooking yields https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/USDA_CookingYields_MeatPoultry02.pdf ·
AH-102 https://www.ars.usda.gov/ARSUserFiles/80400530/pdf/ah102.pdf ·
EuroFIR procedure https://www.fao.org/uploads/media/vasquez-caicedo_et_al__2007_recipe_rulesD2.2.9_02.pdf ·
FSANZ weight-change factors https://www.foodstandards.gov.au/business/labelling/nutrition-panel-calculator/weight-change-factors

## 3. Architecture (tool-augmented, deterministic)

Flow: reuse Part 1 structured ingredients → **Claude agentic loop** resolves each
ingredient (normalise German name → `food_db_search` → pick `food_id` → grams via
units) → **Go computes** macros + yield + fat-uptake, sums, ÷ servings → persist
per-ingredient line items + cache (recompute is pure code, zero model cost).

**Tools to expose:** `food_db_search(query_de, descriptor, max_results) →
candidates[{food_id, name_de, source, per_100g, density, piece_weight, score}]` ·
`convert_to_grams(food_id, amount, unit, prep) → {grams_edible, assumptions}` ·
`get_cooking_yield(food_class, method) → {yield_factor, macro_retention}` ·
`food_estimate_macros(name_de)` (fallback only, persisted flagged `llm_estimate`) ·
`submit_recipe_nutrition(...)` terminal forced call (or assemble final JSON in Go).

**Claude tool-use best practices:** agentic loop `while stop_reason=="tool_use"`;
keep resolution on `tool_choice:auto` (forcing suppresses reasoning); **force only
the terminal submit**; `strict:true` schemas; **model matches, code does math**;
encode tool results as JSON strings; prefer grams internally; cache/freeze
resolutions for determinism. Forced tool choice is incompatible with extended
thinking. Refs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works ·
.../define-tools

**Evidence:** NutriBench (decomposition/CoT is the big lever, RAG helps only when DB
aligns with queries) https://arxiv.org/html/2407.12843v2 · FoodyLLM (generic 0.43 →
specialised 0.91–0.97) https://pmc.ncbi.nlm.nih.gov/articles/PMC12927182/ ·
ChatGPT underestimation https://www.sciencedirect.com/science/article/abs/pii/S0899900723003532 ·
Edamam analysis (parse + oil-absorption + stock-solids exclusion)
https://developer.edamam.com/edamam-nutrition-api

**Pitfalls:** never let the model sum macros; DB coverage is the accuracy ceiling;
cooking yield is not optional; resolve unit/portion ambiguity deterministically;
don't force tool choice on the reasoning step; cache & freeze resolutions.

## 4. Eval harness + prompt iteration

Go `cmd/nutrition-eval` mirroring `ai-eval` (JSON reference set → run model per recipe
→ score → markdown table + `## Summary`). Reuse `ai.Get`, `ai.CostUSD`, `escape`.

**Reference JSON:** `{id, title, category_slug, servings, ingredients[], reference:
{per_serving:{kcal,protein_g,fat_g,carbs_g}, source, uncertainty_pct, notes}}`.

**Metrics (per serving, per macro):** MAE · MAPE · Acc@±20% · Acc@±10% · bias (MPE,
signed — catches systematic over/under) · within-noise% (vs `uncertainty_pct`).
kcal is the keystone. Atwater cross-check `4P+9F+4C ≈ kcal` as a free sanity signal.

**PASS gates (v1, anchored to FDA ±20% label tolerance):** kcal ≥80% within ±20% &
MAPE ≤15% · carbs ≥75% / ≤18% · protein ≥70% / ≤20% · fat ≥65% / ≤25%. Overall PASS
iff kcal passes and no macro clearly fails. Never gate tighter than reference noise.

**Reference set:** compute from BLS/USDA (not scraped panels); 30 to start → 60
before trusting an absolute gate; stratify across the 4 categories; `uncertainty_pct`
~10% clean / ~15–20% fuzzy. Even "true" recipe nutrition varies ±10–20%.

**Prompt-iteration loop:** version the prompt; archive each run
`results-<version>-<date>.md`; append a regression ledger row per (version×model);
dev/holdout split to avoid overfitting; per-row diffs show which dishes broke.
CoT materially helps. Custom Go harness is primary (promptfoo optional secondary).

**Thresholds basis:** FDA 21 CFR 101.9 Class I/II ±20%
https://ofwlaw.com/declaring-small-amounts-of-nutrients-and-dietary-ingredients-on-nutrition-labels/ ·
Anthropic statistical evals https://www.anthropic.com/research/statistical-approach-to-model-evals ·
3-LLM image study (~35% MAPE) https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12513282/
