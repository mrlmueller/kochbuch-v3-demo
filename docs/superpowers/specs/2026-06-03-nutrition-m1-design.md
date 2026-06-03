# Nutrition M1 — Foundation, baseline & eval (design)

Date: 2026-06-03. Branch: `feat/nutrition`.
Umbrella design + research: `docs/superpowers/research/2026-06-03-nutrition-research.md`.

This is **Milestone 1** of the phased Part 2 build. The whole point of M1 is the
*measurement rig*: build the eval and a ground-truth set first, plus a deliberately
naive baseline estimator, so every later accuracy layer (M2 DB lookup, M3 cooking
transforms) is proven by numbers. M1 ships no user-facing feature.

## Goal

`go run ./backend/cmd/nutrition-eval` produces a markdown accuracy report
(per-recipe rows + per-model summary + PASS/FAIL) for a baseline nutrition
estimator over a small, hand-verified ground-truth set of real recipes — giving us
the baseline floor to improve against.

## Non-goals (deferred to later milestones)

- BLS/USDA **Postgres ingestion** and the deterministic lookup estimator → **M2**.
- German-name→BLS **alias table**, amount→grams unit table → **M2**.
- **Cooking transforms** (fat absorption, yield) → **M3**.
- **Storage + display** of nutrition on recipes, admin compute action → **M4**.
- We compute the 6 macros: `kcal, protein_g, fat_g, carbs_g, sugar_g, fibre_g`.

## Components

### 1. Nutrition estimator interface + naive baseline
New `backend/internal/ai/nutrition.go`, mirroring the existing `Extractor`
pattern but with its **own parallel registry** (`RegisterNutrition`/`GetNutrition`
— `Get` returns the recipe `Extractor`, which has no `EstimateNutrition`), same
`provider:model` keys and `Provider()/Model()`:

```go
type Macros struct {
    Kcal, ProteinG, FatG, CarbsG, SugarG, FibreG float64
}
type NutritionRequest struct {
    Title       string
    Servings    int
    Ingredients []NutritionIngredient // {Amount, Name} free-text, from the recipe
    Steps       []string
    Locale      string
}
type NutritionResult struct {
    PerServing   Macros
    InputTokens  int
    OutputTokens int
}
type NutritionEstimator interface {
    EstimateNutrition(ctx context.Context, req NutritionRequest) (NutritionResult, error)
    Provider() string
    Model() string
}
```

`backend/internal/ai/nutrition_claude.go` — **baseline = pure-LLM**: one Claude
call with `tool_choice` forced to a `submit_nutrition` tool whose schema is the 6
per-serving floats. No DB, no tools, no cooking model — intentionally naive so the
eval shows the floor the research predicts (biased, ~−30%). Registered as e.g.
`claude:claude-sonnet-4-6` and `claude:claude-haiku-4-5` (reuse `CostUSD`).

Prompt: a German system prompt instructing per-ingredient decomposition then
per-serving totals (CoT — the research's biggest single lever), returning only via
the tool. Versioned as a `nutritionPromptV1` constant.

### 2. Ground-truth reference set
`backend/cmd/nutrition-eval/recipes.json` — flat, human-editable, mirroring
`ai-eval/dishes.json`:

```json
[{
  "id": "spaghetti-bolognese",
  "title": "Spaghetti Bolognese",
  "category_slug": "hauptgerichte",
  "servings": 4,
  "ingredients": [
    {"amount": "500 g", "name": "Rinderhackfleisch"},
    {"amount": "400 g", "name": "Spaghetti"},
    {"amount": "2 EL",  "name": "Olivenöl"}
  ],
  "reference": {
    "per_serving": {"kcal": 612, "protein_g": 34, "fat_g": 22, "carbs_g": 68, "sugar_g": 9, "fibre_g": 5},
    "source": "computed:BLS4.0+USDA",
    "uncertainty_pct": 12,
    "notes": "Hackfleisch 15% Fett; Pasta Trockengewicht."
  }
}]
```

**How it's built (collaborative — this is the careful, irreducible-human-judgment part):**
- Pick **~12–15 of the existing confirmed recipes**, stratified across the 4
  categories (≥2–3 each), favouring variety (a fried dish, a bake, a sauce, a salad).
- For each, per-serving macros are **computed from BLS 4.0 (primary) + USDA FDC
  (fallback)** with cooking transforms applied by hand. I draft each computation
  from the source data (ingredient lookups, amount→grams, yield/oil) and **you
  verify/correct** — your verified number is the truth.
- `uncertainty_pct`: ~10% for clean recipes, ~15–20% where amounts are fuzzy.
- BLS/USDA are downloaded as **reference data only** in M1 (no Postgres schema yet —
  that's M2). Acquisition + license note (BLS CC BY 4.0 attribution) documented in
  the eval README.

### 3. `cmd/nutrition-eval` harness
`backend/cmd/nutrition-eval/main.go`, structured exactly like `ai-eval/main.go`:
load `recipes.json` (override via `NUTRITION_EVAL_SET`) → for each recipe × model
key → `ai.GetNutrition(key).EstimateNutrition(...)` → score → write `results.md` + stdout.
Reuse `ai.CostUSD`, the `escape` helper, the two-section (rows + `## Summary`) shape.

**Scoring** (pure functions in `score.go`, unit-tested — see Testing). Per macro,
per serving, over N recipes:
- `MAE` = mean(|est−ref|); `MAPE` = mean(|est−ref|/ref)·100
- `Acc@±20%` = % recipes within ±20% (FDA label tolerance); `Acc@±10%` secondary
- `bias` (MPE) = mean((est−ref)/ref)·100 — signed, catches systematic over/under
- `within-noise%` = % recipes within their `uncertainty_pct`
- Atwater check = |4·prot + 9·fat + 4·carb − kcal| / kcal (model self-consistency)

**Per-model summary** columns: `recipes, kcal_MAPE, kcal_MAE, kcal_Acc@20,
prot_MAPE, fat_MAPE, carb_MAPE, sugar_MAPE, fibre_MAPE, kcal_bias, mean_latency_ms,
total_cost_usd`, plus a one-line PASS/FAIL verdict per the gates below.

**PASS gates (v1):** kcal ≥80% within ±20% & MAPE ≤15%; carbs ≥75%/≤18%;
protein ≥70%/≤20%; fat ≥65%/≤25%; (sugar/fibre reported, not yet gated). Overall
PASS iff kcal passes and no gated macro clearly fails. (We expect the M1 baseline
to FAIL — that's the point; M2/M3 close the gap.)

## Testing

- TDD the **scoring functions** (`score_test.go`): `mae`, `mape`, `accWithin`,
  `bias`, `atwaterDelta` are pure and deterministic — exact fixtures, watch fail
  first. This is where the eval's correctness lives.
- The estimator + harness wiring: the Claude call needs a live key, so (like
  `ai-eval`) it's run manually, not in `go test`. A tiny fake `NutritionEstimator`
  can exercise the harness's load→score→render path without the API if useful.
- `go build ./... && go test ./...` stays green.

## Success criteria

1. `go run ./backend/cmd/nutrition-eval` (with `ANTHROPIC_API_KEY`) runs the
   baseline over ≥12 verified reference recipes and writes `results.md` with the
   per-recipe table, per-model summary, and PASS/FAIL verdict.
2. Scoring functions are unit-tested and green.
3. We have a documented **baseline number** (e.g. "Sonnet baseline: kcal MAPE X%,
   Acc@20 Y%") to beat in M2.

## Division of labor
- **Me:** estimator interface + baseline, eval harness + scoring + tests, README,
  drafting each reference recipe's computation from BLS/USDA.
- **You:** verify/correct each reference recipe's macros (the ground truth), and
  point me at the BLS 4.0 download if you'd rather grab it than have me fetch it.
