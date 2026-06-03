# Nutrition production pipeline — design

Date: 2026-06-03. Branch: `feat/nutrition`. Productionizes the eval-validated
estimator (exp8) into the app: an admin computes per-recipe nutrition on demand, it's
stored, and shown per-serving on the public recipe page. Builds on Part 1's calibration
(`confirmed_at`) flag. Architecture decisions below were settled with the user; the
estimator/accuracy rationale lives in `../research/2026-06-03-nutrition-eval-results.md`
and `[[project_nutrition_pipeline_architecture]]`.

## Decisions (locked)

- **Estimator**: exp8 — the LLM emits `{grams, per_100g}` per ingredient (handling
  bone/edible, absorbed oil, dry-weight, fettarm/mager qualifiers via one generic
  prompt); Go code only sums. Model **`claude-sonnet-4-6`**.
- **Trigger**: manual, per recipe. A button on the recipe admin page, **disabled until
  the recipe is confirmed/Kalibriert** (Part 1 flag; "approved" == "Kalibriert").
  Nothing automatic.
- **Execution**: a **background `ai_jobs` job** (reuse the existing worker pool), so cost
  flows into the existing AI cost tracking + `/admin/kosten` automatically.
- **Storage**: a separate **`recipe_nutrition`** table (1:1), not columns on `recipes`.
- **Staleness**: editing a recipe flags its nutrition **`outdated`** (tri-state:
  none / current / outdated). The public page **keeps showing** the (possibly stale)
  numbers until the admin recomputes; only the admin sees the "veraltet" flag.
- **Display**: **per serving** (per-recipe ÷ parsed servings), **kcal-hero card**
  (kcal headline + protein/fat/carbs grid + sugar/fibre subline), with a subtle
  **"≈ geschätzt"** note. Renders only when nutrition exists; the page works with and
  without it.
- **Admin list**: per-row nutrient-status indicator + **both** new filter chips
  (Alle / Keine / Berechnet / Veraltet) **and** sort options (Nährwerte fehlend zuerst,
  Kalibriert zuerst).
- **Cost**: per-recipe cost stored + shown in admin ("berechnet · $0.02"), and rolled
  into the aggregate AI cost tracking.
- **Fixing wrong values**: edit the recipe inputs + recompute. **No** manual override of
  the stored numbers.

## Data model (migration `0010_recipe_nutrition.sql`, goose)

**New table `recipe_nutrition`** (1:1 with recipes):
| column | type | notes |
|---|---|---|
| `recipe_id` | FK → recipes(id), PK, ON DELETE CASCADE | one row per recipe |
| `per_recipe` | jsonb | `{kcal, protein_g, fat_g, carbs_g, sugar_g, fibre_g}` totals |
| `per_serving` | jsonb | same six, = per_recipe ÷ servings_used |
| `servings_used` | real | parsed divisor (0/null ⇒ per_serving = per_recipe) |
| `line_items` | jsonb | audit: `[{ingredient, grams, per_100g{6}}]` |
| `model` | text | e.g. `claude-sonnet-4-6` |
| `in_tokens` / `out_tokens` | int | usage |
| `cost_usd` | double precision | per-recipe cost |
| `outdated` | boolean, default false | set true when the recipe is edited |
| `computed_at` | timestamptz, default now() | |

**Extend `ai_jobs`** (same migration): add `kind text NOT NULL DEFAULT 'extraction'`
(`'extraction' | 'nutrition'`) and `recipe_id` (FK → recipes(id), nullable, ON DELETE
CASCADE; null for extraction jobs). Existing rows backfill to `'extraction'`.

**Status derivation (UI)** — from `recipe_nutrition` presence/`outdated` + the latest
nutrition `ai_job`:
`keine` (no row, no active job) · `läuft` (queued/processing job) · `berechnet`
(row, outdated=false) · `veraltet` (row, outdated=true) · `fehlgeschlagen` (last job
failed, no row). Filter chips operate on the persistent three: Keine / Berechnet / Veraltet.

## Backend

### Estimator — `internal/ai/nutrition.go`
- Own registry: `RegisterNutrition(key, NutritionEstimator)` / `GetNutrition(key)`,
  separate from the extraction `Registry`. One impl (`claude`) self-registers in `init()`.
- `Estimate(ctx, recipe) (NutritionResult, Usage, error)`: builds the German exp8 prompt
  (title, servings, ingredients, steps), calls Claude with the `finalize` tool
  (`line_items: [{ingredient, grams, per_100g{6}}]`), sums in Go → per-recipe totals.
  Parses servings (leading number) → per_serving. Returns macros + line_items + tokens.
- Reuses the Anthropic SDK wiring from `claude.go`. Prompt is GENERIC (no recipe-specific
  hints) — same constraint as the extraction prompts.

### Worker — `internal/ai/worker.go`
- `handle()` branches on `job.Kind`:
  - `extraction` → unchanged.
  - `nutrition` → `store.GetRecipeByID(recipe_id)` → `GetNutrition(provider:model).Estimate`
    → `store.SetRecipeNutrition(...)` (macros + line_items + tokens + cost + model) →
    `SetAIJobReady(job, payload, in, out, cost)`. Cost via existing `CostUSD(...)`.
  - On error: existing retry/`SetAIJobFailed` path (no `recipe_nutrition` row written).
- Nutrition jobs are admin-triggered and **exempt from the per-user/daily extraction
  quotas** (those guard user photo uploads, not admin actions); cost is still logged.

### Store — `internal/db` (interface + postgres.go + mock_store.go)
- `EnqueueNutritionJob(ctx, recipeID) (*AIJob, error)` (or extend the existing enqueue
  with kind/recipe_id).
- `GetRecipeNutrition(ctx, recipeID) (*RecipeNutrition, error)`.
- `SetRecipeNutrition(ctx, recipeID, RecipeNutrition) error` (upsert; clears `outdated`).
- `MarkNutritionOutdated(ctx, recipeID) error` (called from the recipe-update path).
- `ListNutritionStatuses(ctx) (map[slug]Status, error)` for the admin list.
- `GetRecipeByID(ctx, recipeID)` — the worker holds `recipe_id` from the job and needs
  the recipe (title/servings/ingredients/steps). Add if not already present (Part 1
  worked by slug).
- `ClaimNextAIJob` already returns the job; extend the model/scan for `kind` + `recipe_id`.
- Public recipe read (`GetRecipe`/`GetRecipeBySlug`) joins `recipe_nutrition` and exposes
  **only `per_serving` + a `computed` flag** — never `cost_usd`, `line_items`, `model`, or
  token counts. The admin `GET .../nutrition` endpoint returns the full detail (per_recipe,
  per_serving, line_items, cost, status) for the admin page.

### Routes — `main.go` (admin subgroup, `RequireAdmin`)
- `POST /api/admin/recipes/{slug}/nutrition` — resolve slug→recipe; **reject 409 unless
  confirmed**; enqueue a `kind=nutrition` job; return job id/status.
- `GET  /api/admin/recipes/{slug}/nutrition` — job state + result (admin page polls).
- Nutrient statuses for the list: extend Part 1's `GET /api/admin/recipes/status` to
  include each recipe's nutrient status (keep one round-trip).
- Public read: `nutrition` (per_serving + computed) added to the recipe GET payload
  (served on the internal-token SSR path; global, non-private data).

### Outdated flag hook
The existing recipe-update handler/store calls `MarkNutritionOutdated(recipeID)` after a
successful write (no-op if no row). Recipe delete cascades (FK).

## Frontend

### Public recipe page
- `lib/api.server.ts` `getRecipe` includes `nutrition: { perServing:{6}, computed } | null`.
  The recipe page renders the **kcal-hero card** when present, nothing when null. Cached
  via `'use cache'` + `cacheTag('recipe-<slug>')` like the rest of the recipe.
- Card: kcal headline + "pro Portion", a protein/fat/carbs 3-cell grid, a sugar/fibre
  subline, and a small "≈ geschätzte Werte" caption.

### Admin recipe page (`/admin/[slug]`)
- A "Nährwerte berechnen" control beside the Kalibriert control: **disabled until
  confirmed**; shows status (keine/läuft/berechnet · $cost/veraltet/fehlgeschlagen), the
  computed per-serving values, and a recompute button. After enqueue it **polls** the
  status endpoint; on `ready` it triggers `revalidateTag('recipe-<slug>')` (+ recipes tag)
  so the public page refreshes (the write happened async in Go, so revalidation is
  client-triggered on completion).

### Admin list (`components/admin/recipe-list.tsx`)
- Per-row nutrient indicator (alongside the existing `CalToggle`).
- New filter chips: Alle / Keine / Berechnet / Veraltet (mirrors the calibration chips).
- New sort options in the existing dropdown: "Nährwerte fehlend zuerst", "Kalibriert
  zuerst" (added to Name/Zeit).
- Nutrient + confirmed status come from the extended `/api/admin/recipes/status`
  (admin-only fetch; keeps the public page static — same pattern as Part 1).

## Cache invalidation
The Go worker writes nutrition asynchronously, so there's no Next proxy call at write
time. Instead the admin page (already polling the job) calls a Next revalidation route on
completion → `revalidateTag('recipe-<slug>')` + `revalidateTag('recipes')`, busting the
SSR cache so the public card appears. Stale-after-edit numbers are intentionally left
visible until the admin recomputes.

## Error handling
- LLM/tool failure → existing `ai_jobs` retry (MaxAttempts), then `fehlgeschlagen`; no
  `recipe_nutrition` row; public page simply shows no card.
- Estimator validates the `finalize` output (six numbers present, grams ≥ 0); malformed
  output fails the job rather than writing garbage.
- Unparseable servings → `servings_used = 0`, `per_serving = per_recipe` (card still
  renders; effectively whole-recipe).
- Enqueue on an unconfirmed recipe → 409 (button shouldn't allow it, but enforce server-side).

## Testing (TDD)
- **Go unit**: sum logic (line_items → totals), servings parse, `MarkNutritionOutdated`,
  worker nutrition-branch (mock `NutritionEstimator` → writes `recipe_nutrition` + cost),
  enqueue-gated-on-confirmed handler (+ 409 path). Mock store gets the new methods.
- **Eval gate**: port `recipes.json` + `recipes_external.json` + MAPE/Acc/bias scoring to
  Go `cmd/nutrition-eval` (mirrors `cmd/ai-eval`); run manually before prompt/model
  changes. Gate: kcal ≤ ~11% MAPE / ~80% within ±20% (vague), ≤ ~8% (grams given).
- **Frontend**: card renders with and without nutrition; admin button disabled until
  confirmed; list filter/sort by nutrient status.

## Out of scope (YAGNI)
Manual override of computed values; BLS/USDA matching; deterministic amount/transform
tables (all eval-killed); a reviewer/critic pass (measured net-small, dropped); nutrition
for the per-user recipe-authoring flow beyond what the admin triggers.

## Build order (for the plan)
1. Migration `0010` (recipe_nutrition + ai_jobs kind/recipe_id).
2. Estimator `internal/ai/nutrition.go` + unit test (port exp8).
3. Store methods (interface + postgres + mock) + worker nutrition branch + tests.
4. Enqueue/status routes (gated) + extend `/status` + public read join + handler tests.
5. `cmd/nutrition-eval` Go harness (regression gate).
6. Frontend: public card; admin button + polling + revalidate; list chips + sort.
7. Outdated-on-edit hook.
