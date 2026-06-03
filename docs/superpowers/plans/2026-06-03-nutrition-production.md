# Nutrition Production Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin compute per-recipe nutrition (6 macros) on demand for a calibrated recipe, stored in a new table, and shown per-serving on the public recipe page.

**Architecture:** Port the eval-validated `exp8` estimator (LLM emits `{grams, per_100g}` per ingredient; Go sums) into `internal/ai`. Run it as a background `ai_jobs` job (a new `kind='nutrition'` discriminator reusing the existing worker/cost machinery, so cost lands in `/admin/kosten`). Results go in a 1:1 `recipe_nutrition` table keyed by `recipe_slug`. Editing a recipe flags its nutrition `outdated`; the public page keeps showing the numbers until recompute. Spec: `../specs/2026-06-03-nutrition-production-design.md`.

**Tech Stack:** Go 1.26 (chi, pgx, goose, anthropic-sdk-go), Next.js 16 (App Router, `'use cache'`/`cacheTag`), Postgres. Eval prototype: `backend/cmd/nutrition-eval/_experiments/exp8_llm_only.py`.

---

## File structure

**Backend (create):**
- `backend/migrations/0010_recipe_nutrition.sql` — table + `ai_jobs` columns.
- `backend/internal/models/nutrition.go` — `Macros`, `NutritionLineItem`, `RecipeNutrition`, `PublicNutrition`, `NutritionStatus`.
- `backend/internal/ai/nutrition.go` — estimator (exp8 port) + `RegisterNutrition`/`GetNutrition` + claude impl.
- `backend/internal/ai/nutrition_test.go` — sum + servings-parse unit tests.
- `backend/internal/db/nutrition.go` — `recipe_nutrition` store methods + `CreateNutritionJob`.
- `backend/internal/handlers/admin_recipe_nutrition.go` — enqueue + status handlers.
- `backend/internal/handlers/admin_recipe_nutrition_test.go` — handler tests.
- `backend/cmd/nutrition-eval/main.go` — Go regression-gate harness.

**Backend (modify):**
- `backend/internal/models/ai_job.go` — add `Kind`, `RecipeSlug`.
- `backend/internal/models/recipe.go` — add `Nutrition *PublicNutrition`.
- `backend/internal/db/store.go` — interface additions.
- `backend/internal/db/ai_jobs.go` — `aiJobCols` + `scanAIJobRow` for new columns.
- `backend/internal/db/recipes.go` — `GetRecipeBySlug` join; `IsRecipeConfirmed`.
- `backend/internal/db/mock_store.go` — mock fields + methods.
- `backend/internal/ai/worker.go` — `WorkerOpts.ResolveNutrition` + nutrition branch.
- `backend/internal/ai/worker_test.go` (create if absent) — nutrition-branch test.
- `backend/internal/handlers/recipes_write.go` — `UpdateRecipe` calls `MarkNutritionOutdated`.
- `backend/main.go` — register routes + wire `ResolveNutrition`.

**Frontend (create):**
- `frontend/components/nutrition-card.tsx` — public per-serving card.
- `frontend/lib/use-nutrition-statuses.ts` — admin-only status hook (mirrors `use-admin-confirmations.ts`).

**Frontend (modify):**
- `frontend/lib/api.ts` — `Recipe.nutrition` type + client fns (`clientGetNutritionStatuses`, `clientComputeNutrition`, `clientGetNutritionDetail`).
- `frontend/app/rezept/[slug]/detail-client.tsx` — render `<NutritionCard>`.
- `frontend/app/admin/[slug]/page.tsx` (+ `recipe-form.tsx`) — compute control.
- `frontend/components/admin/recipe-list.tsx` — nutrient chips + sort.
- `frontend/app/api/proxy/[...path]/route.ts` — allow the nutrition admin paths.

---

## Task 1: Migration — `recipe_nutrition` table + `ai_jobs` discriminator

**Files:**
- Create: `backend/migrations/0010_recipe_nutrition.sql`

- [ ] **Step 1: Write the migration**

```sql
-- +goose Up
-- +goose StatementBegin
ALTER TABLE ai_jobs
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'extraction'
    CHECK (kind IN ('extraction','nutrition')),
  ADD COLUMN recipe_slug TEXT REFERENCES recipes(slug) ON DELETE SET NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS recipe_nutrition (
    recipe_slug   TEXT PRIMARY KEY REFERENCES recipes(slug) ON DELETE CASCADE,
    per_recipe    JSONB            NOT NULL,
    per_serving   JSONB            NOT NULL,
    servings_used REAL             NOT NULL DEFAULT 0,
    line_items    JSONB            NOT NULL DEFAULT '[]',
    model         TEXT             NOT NULL,
    input_tokens  INT              NOT NULL DEFAULT 0,
    output_tokens INT              NOT NULL DEFAULT 0,
    cost_usd      DOUBLE PRECISION NOT NULL DEFAULT 0,
    outdated      BOOLEAN          NOT NULL DEFAULT FALSE,
    computed_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS recipe_nutrition;
ALTER TABLE ai_jobs DROP COLUMN IF EXISTS recipe_slug;
ALTER TABLE ai_jobs DROP COLUMN IF EXISTS kind;
-- +goose StatementEnd
```

Note: `ai_jobs.recipe_slug` uses `ON DELETE SET NULL` (not CASCADE) so a recipe delete keeps the cost-bearing job row — matching the existing "never lose a paid cost" policy in `DeleteOldAIJobs`. `recipe_nutrition` cascades (the result is recipe-specific; cost is preserved on the ai_job).

- [ ] **Step 2: Apply and verify**

Run (Postgres must be up — `docker compose up -d postgres`): `cd backend && go run . &` then check the log says `migrations OK`, or run goose directly. Verify: `docker compose exec -T -e PGPASSWORD=secret postgres psql -U postgres -d kochbuch -c '\d recipe_nutrition'` shows the table and `\d ai_jobs` shows `kind` + `recipe_slug`.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/0010_recipe_nutrition.sql
git commit -m "feat(db): recipe_nutrition table + ai_jobs nutrition kind"
```

---

## Task 2: Models — nutrition types + AIJob/Recipe additions

**Files:**
- Create: `backend/internal/models/nutrition.go`
- Modify: `backend/internal/models/ai_job.go`, `backend/internal/models/recipe.go`

- [ ] **Step 1: Create `nutrition.go`**

```go
package models

import "time"

// Macros are the six tracked values (kcal; the rest in grams).
type Macros struct {
	Kcal     float64 `json:"kcal"`
	ProteinG float64 `json:"protein_g"`
	FatG     float64 `json:"fat_g"`
	CarbsG   float64 `json:"carbs_g"`
	SugarG   float64 `json:"sugar_g"`
	FibreG   float64 `json:"fibre_g"`
}

// NutritionLineItem is one resolved ingredient — the audit trail.
type NutritionLineItem struct {
	Ingredient string `json:"ingredient"`
	Grams      float64 `json:"grams"`
	Per100g    Macros  `json:"per_100g"`
}

// RecipeNutrition is the full stored record (admin detail).
type RecipeNutrition struct {
	RecipeSlug   string              `json:"recipe_slug"`
	PerRecipe    Macros              `json:"per_recipe"`
	PerServing   Macros              `json:"per_serving"`
	ServingsUsed float64             `json:"servings_used"`
	LineItems    []NutritionLineItem `json:"line_items"`
	Model        string              `json:"model"`
	InputTokens  int                 `json:"input_tokens"`
	OutputTokens int                 `json:"output_tokens"`
	CostUSD      float64             `json:"cost_usd"`
	Outdated     bool                `json:"outdated"`
	ComputedAt   time.Time           `json:"computed_at"`
}

// PublicNutrition is the trimmed shape on the public recipe payload —
// per-serving only, never cost / line items / model / tokens.
type PublicNutrition struct {
	PerServing Macros `json:"per_serving"`
	Outdated   bool   `json:"outdated,omitempty"`
}

type NutritionStatus string

const (
	NutritionNone     NutritionStatus = "none"
	NutritionCurrent  NutritionStatus = "current"
	NutritionOutdated NutritionStatus = "outdated"
)
```

- [ ] **Step 2: Extend `AIJob`** — in `ai_job.go`, add two fields to the struct (after `ImageURLs`):

```go
	Kind       string   `json:"kind"`
	RecipeSlug *string  `json:"recipe_slug,omitempty"`
```

- [ ] **Step 3: Extend `Recipe`** — in `recipe.go`, add to the `Recipe` struct (after `UpdatedAt`):

```go
	Nutrition *PublicNutrition `json:"nutrition,omitempty"`
```

- [ ] **Step 4: Verify build**

Run: `cd backend && go build ./...`
Expected: compiles (mock/store will be completed in Task 4; if you do tasks strictly in order, `go build ./internal/models` here).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/models/
git commit -m "feat(models): nutrition types + ai_job kind/recipe_slug + recipe.nutrition"
```

---

## Task 3: Nutrition estimator (exp8 port) + unit tests

**Files:**
- Create: `backend/internal/ai/nutrition.go`, `backend/internal/ai/nutrition_test.go`

The estimator is pure except for the LLM call. We TDD the deterministic parts (`sumLineItems`, `parseServings`) and keep the Claude call behind an interface so the worker test can mock it.

- [ ] **Step 1: Write failing tests** — `nutrition_test.go`

```go
package ai

import (
	"math"
	"testing"

	"backend/internal/models"
)

func approx(a, b float64) bool { return math.Abs(a-b) < 0.05 }

func TestSumLineItems(t *testing.T) {
	items := []models.NutritionLineItem{
		{Ingredient: "Butter", Grams: 100, Per100g: models.Macros{Kcal: 717, FatG: 81}},
		{Ingredient: "Zucker", Grams: 50, Per100g: models.Macros{Kcal: 400, CarbsG: 100, SugarG: 100}},
	}
	got := sumLineItems(items)
	if !approx(got.Kcal, 917) || !approx(got.FatG, 81) || !approx(got.CarbsG, 50) || !approx(got.SugarG, 50) {
		t.Fatalf("sum wrong: %+v", got)
	}
}

func TestParseServings(t *testing.T) {
	cases := map[string]float64{
		"4 Personen": 4, "1 Person": 1, "12 Portionen": 12,
		"2 cups (240 g)": 2, "": 0, "nach Bedarf": 0, "ca. 6": 6,
	}
	for in, want := range cases {
		if got := parseServings(in); got != want {
			t.Errorf("parseServings(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestPerServing(t *testing.T) {
	per := models.Macros{Kcal: 800, ProteinG: 40}
	got := divideMacros(per, 4)
	if !approx(got.Kcal, 200) || !approx(got.ProteinG, 10) {
		t.Fatalf("divide wrong: %+v", got)
	}
	// servings 0 → unchanged (fall back to whole recipe)
	if got := divideMacros(per, 0); !approx(got.Kcal, 800) {
		t.Fatalf("divide by 0 should be identity: %+v", got)
	}
}
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && go test ./internal/ai -run 'TestSumLineItems|TestParseServings|TestPerServing'`
Expected: FAIL — undefined `sumLineItems` / `parseServings` / `divideMacros`.

- [ ] **Step 3: Implement `nutrition.go`**

```go
package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"backend/internal/models"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// NutritionResult is what the estimator returns for a recipe.
type NutritionResult struct {
	PerRecipe    models.Macros
	PerServing   models.Macros
	ServingsUsed float64
	LineItems    []models.NutritionLineItem
	InputTokens  int
	OutputTokens int
}

// NutritionEstimator resolves a recipe into nutrition. The LLM emits per
// ingredient {grams, per_100g}; Go only sums (the exp8 architecture).
type NutritionEstimator interface {
	Estimate(ctx context.Context, r models.Recipe) (NutritionResult, error)
	Provider() string
	Model() string
}

type nutritionConstructor func() (NutritionEstimator, error)

var nutritionRegistry = map[string]nutritionConstructor{}

func RegisterNutrition(key string, c nutritionConstructor) { nutritionRegistry[key] = c }

func GetNutrition(key string) (NutritionEstimator, error) {
	c, ok := nutritionRegistry[key]
	if !ok {
		return nil, fmt.Errorf("unknown nutrition model: %s", key)
	}
	return c()
}

func init() {
	RegisterNutrition("claude:claude-sonnet-4-6", func() (NutritionEstimator, error) {
		return newClaudeNutrition("claude-sonnet-4-6"), nil
	})
}

// ── deterministic helpers (unit-tested) ───────────────────────────────

func sumLineItems(items []models.NutritionLineItem) models.Macros {
	var t models.Macros
	for _, li := range items {
		if li.Grams <= 0 {
			continue
		}
		f := li.Grams / 100.0
		m := li.Per100g
		t.Kcal += m.Kcal * f
		t.ProteinG += m.ProteinG * f
		t.FatG += m.FatG * f
		t.CarbsG += m.CarbsG * f
		t.SugarG += m.SugarG * f
		t.FibreG += m.FibreG * f
	}
	return t
}

func divideMacros(m models.Macros, n float64) models.Macros {
	if n <= 0 {
		return m
	}
	return models.Macros{
		Kcal: m.Kcal / n, ProteinG: m.ProteinG / n, FatG: m.FatG / n,
		CarbsG: m.CarbsG / n, SugarG: m.SugarG / n, FibreG: m.FibreG / n,
	}
}

var servingsNumRe = regexp.MustCompile(`(\d+(?:[.,]\d+)?)`)

// parseServings extracts the leading count from free-text servings
// ("4 Personen" → 4, "2 cups (240 g)" → 2). 0 when none is found.
func parseServings(s string) float64 {
	m := servingsNumRe.FindString(s)
	if m == "" {
		return 0
	}
	v, err := strconv.ParseFloat(strings.ReplaceAll(m, ",", "."), 64)
	if err != nil {
		return 0
	}
	return v
}

// ── the claude estimator ──────────────────────────────────────────────

type claudeNutrition struct {
	model  string
	client *anthropic.Client
}

func newClaudeNutrition(model string) NutritionEstimator {
	key := os.Getenv("ANTHROPIC_API_KEY")
	if key == "" {
		return &claudeNutrition{model: model}
	}
	c := anthropic.NewClient(option.WithAPIKey(key))
	return &claudeNutrition{model: model, client: &c}
}

func (e *claudeNutrition) Provider() string { return "claude" }
func (e *claudeNutrition) Model() string    { return e.model }

// macroProps is the per_100g / finalize macro shape, reused for the schema.
func macroProps() map[string]any {
	num := map[string]any{"type": "number"}
	return map[string]any{
		"kcal": num, "protein_g": num, "fat_g": num,
		"carbs_g": num, "sugar_g": num, "fibre_g": num,
	}
}

func nutritionRecipeText(r models.Recipe) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Titel: %s\nPortionen: %s\n\nZutaten:\n", r.Title, r.Servings)
	for _, ing := range r.Ingredients {
		line := strings.TrimSpace(ing.Display)
		if line == "" {
			line = ing.Name
		} else {
			line = line + " " + ing.Name
		}
		fmt.Fprintf(&b, "- %s\n", strings.TrimSpace(line))
	}
	if len(r.Steps) > 0 {
		b.WriteString("\nZubereitung:\n")
		for i, s := range r.Steps {
			fmt.Fprintf(&b, "%d. %s\n", i+1, s)
		}
	}
	return b.String()
}

const nutritionSystem = `Du bist Ernährungsexperte und schätzt die Gesamt-Nährwerte eines GANZEN Rezepts (Summe über ALLE Portionen, nicht pro Portion). Arbeite Zutat für Zutat und denke die Zubereitung mit — die Kalorien (kcal) sind am wichtigsten.

Gib für JEDE essbare Zutat zwei Dinge an:

1) grams — wie viele Gramm dieser Zutat am Ende WIRKLICH GEGESSEN werden (ganzes Rezept):
   • Haushaltsmaße/Stückzahlen realistisch in Gramm umrechnen. Anhaltspunkte: 1 EL Öl ≈ 14 g, 1 EL ≈ 15 g, 1 TL ≈ 5 g, 1 Tasse Mehl ≈ 120 g, 1 Ei ≈ 55 g, 1 Zwiebel ≈ 110 g, 1 Knoblauchzehe ≈ 3 g, 1 Tomate ≈ 110 g, 1 Paprika ≈ 120 g, 1 Karotte ≈ 80 g, 1 mittelgroße Kartoffel ≈ 120 g, ein Frühlingsrollen-/Reispapierblatt ≈ 10–12 g, ein Lasagneblatt ≈ 15 g, eine Scheibe Brot/Toast ≈ 30 g, ein Brötchen ≈ 60 g.
   • Nur die TATSÄCHLICH verwendete Menge zählen — nicht die ganze Packung/alle Blätter, wenn für die Füll-/Teigmenge weniger realistisch ist.
   • NICHT-Essbares abziehen: Knochen, Schale, Kerne, Strunk. Faustregeln: Geflügel mit Knochen ≈ 65 % essbares Fleisch, Spareribs/Kotelett mit Knochen ≈ 60 %, Garnelen mit Schale ≈ 50 %.
   • Nudeln, Reis, Hülsenfrüchte: TROCKENgewicht angeben (Wasseraufnahme beim Kochen ändert die Kalorien NICHT). Gemüse/Fleisch: rohes Gewicht.

2) per_100g — kcal, Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe pro 100 g GENAU dieser Zutat, passend zur oben gewählten Gramm-Basis (i.d.R. roh / wie eingekauft):
   • Sorten-/Fettangaben beachten: „fettarm", „mager", „light", „10 % Fett", „Vollfett", „Vollmilch", „1,5 %", Sahne vs. saure Sahne usw. — wähle die Werte passend, nicht pauschal die Vollfett-Variante.
   • Trocken vs. frisch beachten.

Zubereitung mitdenken (wichtig für die Kalorien):
   • Bratöl/-fett, das im Gericht BLEIBT und mitgegessen wird, zählt. Ist es nicht schon als Zutat gelistet, füge eine EIGENE Zeile „aufgenommenes Bratfett" mit realistischer Grammzahl hinzu (Paniertes/Frittiertes nimmt viel auf; kurz in wenig Öl Gebratenes wenig; im Airfryer/ohne Öl praktisch nichts).
   • Reines FRITTIERBAD-Öl, das nur zum Erhitzen dient und NICHT mitgegessen wird, NICHT als Zutat zählen — nur den aufgenommenen Anteil.
   • Fett, das VERLOREN geht (abgegossenes Bratfett, ausgelassener Speck, beim Kochen abgeschöpftes/im Sud verworfenes Fett), berücksichtigen: dann weniger Gramm oder einen mageren per_100g-Wert wählen.

Weglassen: Salz, Gewürze, Wasser/Brühe ohne nennenswerte Kalorien und nicht bezifferbare Kleinstmengen.

Die Summe wird AUTOMATISCH aus deinen Zeilen berechnet — du musst nicht selbst rechnen oder summieren. Denke kurz Schritt für Schritt und rufe dann finalize mit allen Zutaten auf.`

func (e *claudeNutrition) Estimate(ctx context.Context, r models.Recipe) (NutritionResult, error) {
	if e.client == nil {
		return NutritionResult{}, fmt.Errorf("ANTHROPIC_API_KEY not set")
	}

	lineItemSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ingredient": map[string]any{"type": "string"},
			"grams":      map[string]any{"type": "number"},
			"per_100g": map[string]any{
				"type": "object", "properties": macroProps(),
				"required": []string{"kcal", "protein_g", "fat_g", "carbs_g", "sugar_g", "fibre_g"},
			},
		},
		"required": []string{"ingredient", "grams", "per_100g"},
	}
	tool := anthropic.ToolParam{
		Name:        "finalize",
		Description: anthropic.String("Übergibt die Zutaten mit Gramm und Nährwerten pro 100 g. Die Summe wird automatisch berechnet — summiere NICHT selbst."),
		InputSchema: anthropic.ToolInputSchemaParam{
			Properties: map[string]any{
				"line_items": map[string]any{"type": "array", "items": lineItemSchema},
			},
			Required: []string{"line_items"},
		},
	}

	msg, err := e.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(e.model),
		MaxTokens: 4096,
		System:    []anthropic.TextBlockParam{{Text: nutritionSystem}},
		Messages: []anthropic.MessageParam{{
			Role:    anthropic.MessageParamRoleUser,
			Content: []anthropic.ContentBlockParamUnion{anthropic.NewTextBlock(nutritionRecipeText(r))},
		}},
		Tools: []anthropic.ToolUnionParam{{OfTool: &tool}},
		// tool_choice auto: lets the model reason (CoT) before finalize.
	})
	if err != nil {
		return NutritionResult{}, err
	}

	var raw json.RawMessage
	for _, block := range msg.Content {
		if tu, ok := block.AsAny().(anthropic.ToolUseBlock); ok && tu.Name == "finalize" {
			raw = json.RawMessage(tu.JSON.Input.Raw())
			break
		}
	}
	if len(raw) == 0 {
		return NutritionResult{}, fmt.Errorf("model did not call finalize")
	}
	var parsed struct {
		LineItems []models.NutritionLineItem `json:"line_items"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return NutritionResult{}, fmt.Errorf("decode finalize: %w", err)
	}
	if len(parsed.LineItems) == 0 {
		return NutritionResult{}, fmt.Errorf("finalize returned no line items")
	}

	perRecipe := sumLineItems(parsed.LineItems)
	servings := parseServings(r.Servings)
	return NutritionResult{
		PerRecipe:    perRecipe,
		PerServing:   divideMacros(perRecipe, servings),
		ServingsUsed: servings,
		LineItems:    parsed.LineItems,
		InputTokens:  int(msg.Usage.InputTokens),
		OutputTokens: int(msg.Usage.OutputTokens),
	}, nil
}
```

> If the `anthropic-sdk-go` `System`/`MessageNewParams` field shape differs in this version, mirror exactly how `claude.go` builds its request (it's the source of truth for the installed SDK). The only differences here: a `System` prompt, `tool_choice` left as auto (no `ToolChoice` field set), and parsing the `finalize` tool.

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && go test ./internal/ai -run 'TestSumLineItems|TestParseServings|TestPerServing' -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/ai/nutrition.go backend/internal/ai/nutrition_test.go
git commit -m "feat(ai): nutrition estimator (exp8 port) + sum/servings unit tests"
```

---

## Task 4: Store — recipe_nutrition methods, ai_jobs columns, recipe join

**Files:**
- Create: `backend/internal/db/nutrition.go`
- Modify: `backend/internal/db/store.go`, `backend/internal/db/ai_jobs.go`, `backend/internal/db/recipes.go`, `backend/internal/db/mock_store.go`

- [ ] **Step 1: Extend the `Store` interface** — in `store.go`, add inside the interface (after `ListConfirmedSlugs`):

```go
	IsRecipeConfirmed(ctx context.Context, slug string) (bool, error)

	// Nutrition
	CreateNutritionJob(ctx context.Context, userID, recipeSlug string) (string, error)
	GetRecipeNutrition(ctx context.Context, slug string) (*models.RecipeNutrition, error)
	SetRecipeNutrition(ctx context.Context, n models.RecipeNutrition) error
	MarkNutritionOutdated(ctx context.Context, slug string) error
	ListNutritionStatuses(ctx context.Context) (map[string]models.NutritionStatus, error)
```

- [ ] **Step 2: Add the new ai_jobs columns to scanning** — in `ai_jobs.go`, change `aiJobCols` to append `kind, recipe_slug`, and update `scanAIJobRow` to scan them:

```go
const aiJobCols = `id, user_id, status, provider, model, image_urls,
    recipe_json, error, attempts, input_tokens, output_tokens, cost_usd,
    created_at, started_at, finished_at, kind, recipe_slug`
```

In `scanAIJobRow`, add `var recipeSlug *string` and extend the `r.Scan(...)` arg list (append at the end, matching column order): `..., &j.FinishedAt, &j.Kind, &recipeSlug,` then after the nil/error handling set `j.RecipeSlug = recipeSlug`.

- [ ] **Step 3: Create `nutrition.go` store methods**

```go
package db

import (
	"context"
	"encoding/json"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) IsRecipeConfirmed(ctx context.Context, slug string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT confirmed_at IS NOT NULL FROM recipes WHERE slug = $1`, slug).Scan(&ok)
	if err == pgx.ErrNoRows {
		return false, ErrRecipeNotFound
	}
	return ok, err
}

func (s *PostgresStore) CreateNutritionJob(ctx context.Context, userID, recipeSlug string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO ai_jobs (user_id, status, provider, model, image_urls, kind, recipe_slug)
		VALUES ($1, 'queued', 'claude', 'claude-sonnet-4-6', '[]', 'nutrition', $2)
		RETURNING id`, userID, recipeSlug).Scan(&id)
	return id, err
}

func (s *PostgresStore) GetRecipeNutrition(ctx context.Context, slug string) (*models.RecipeNutrition, error) {
	var n models.RecipeNutrition
	var perR, perS, items []byte
	err := s.pool.QueryRow(ctx, `
		SELECT recipe_slug, per_recipe, per_serving, servings_used, line_items,
		       model, input_tokens, output_tokens, cost_usd, outdated, computed_at
		FROM recipe_nutrition WHERE recipe_slug = $1`, slug).
		Scan(&n.RecipeSlug, &perR, &perS, &n.ServingsUsed, &items,
			&n.Model, &n.InputTokens, &n.OutputTokens, &n.CostUSD, &n.Outdated, &n.ComputedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(perR, &n.PerRecipe)
	_ = json.Unmarshal(perS, &n.PerServing)
	_ = json.Unmarshal(items, &n.LineItems)
	return &n, nil
}

func (s *PostgresStore) SetRecipeNutrition(ctx context.Context, n models.RecipeNutrition) error {
	perR, _ := json.Marshal(n.PerRecipe)
	perS, _ := json.Marshal(n.PerServing)
	items, _ := json.Marshal(n.LineItems)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO recipe_nutrition
		  (recipe_slug, per_recipe, per_serving, servings_used, line_items,
		   model, input_tokens, output_tokens, cost_usd, outdated, computed_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,now())
		ON CONFLICT (recipe_slug) DO UPDATE SET
		  per_recipe=$2, per_serving=$3, servings_used=$4, line_items=$5,
		  model=$6, input_tokens=$7, output_tokens=$8, cost_usd=$9,
		  outdated=false, computed_at=now()`,
		n.RecipeSlug, perR, perS, n.ServingsUsed, items,
		n.Model, n.InputTokens, n.OutputTokens, n.CostUSD)
	return err
}

func (s *PostgresStore) MarkNutritionOutdated(ctx context.Context, slug string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE recipe_nutrition SET outdated = true WHERE recipe_slug = $1`, slug)
	return err
}

func (s *PostgresStore) ListNutritionStatuses(ctx context.Context) (map[string]models.NutritionStatus, error) {
	rows, err := s.pool.Query(ctx, `SELECT recipe_slug, outdated FROM recipe_nutrition`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]models.NutritionStatus{}
	for rows.Next() {
		var slug string
		var outdated bool
		if err := rows.Scan(&slug, &outdated); err != nil {
			return nil, err
		}
		if outdated {
			out[slug] = models.NutritionOutdated
		} else {
			out[slug] = models.NutritionCurrent
		}
	}
	return out, rows.Err()
}
```

- [ ] **Step 4: Join nutrition into the public recipe read** — in `recipes.go` `GetRecipeBySlug`, after the recipe is loaded, populate `r.Nutrition`. Add at the end (before `return &r, nil`):

```go
	// Per-serving nutrition for the public payload (per-serving only).
	var perS []byte
	var outdated bool
	err = s.pool.QueryRow(ctx,
		`SELECT per_serving, outdated FROM recipe_nutrition WHERE recipe_slug = $1`, slug).
		Scan(&perS, &outdated)
	if err == nil {
		var pn models.PublicNutrition
		if json.Unmarshal(perS, &pn.PerServing) == nil {
			pn.Outdated = outdated
			r.Nutrition = &pn
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
```

- [ ] **Step 5: Add mock methods** — in `mock_store.go`, add fields to `MockStore`:

```go
	// Nutrition
	NutritionBySlug   map[string]*models.RecipeNutrition
	NutritionStatuses map[string]models.NutritionStatus
	Confirmed         bool
	LastNutritionJobSlug string
	SetNutritionCalls    []models.RecipeNutrition
	OutdatedCalls        []string
```

and methods:

```go
func (m *MockStore) IsRecipeConfirmed(_ context.Context, _ string) (bool, error) {
	return m.Confirmed, m.Err
}
func (m *MockStore) CreateNutritionJob(_ context.Context, _ , slug string) (string, error) {
	m.LastNutritionJobSlug = slug
	return "job-1", m.Err
}
func (m *MockStore) GetRecipeNutrition(_ context.Context, slug string) (*models.RecipeNutrition, error) {
	if m.NutritionBySlug == nil {
		return nil, m.Err
	}
	return m.NutritionBySlug[slug], m.Err
}
func (m *MockStore) SetRecipeNutrition(_ context.Context, n models.RecipeNutrition) error {
	m.SetNutritionCalls = append(m.SetNutritionCalls, n)
	return m.Err
}
func (m *MockStore) MarkNutritionOutdated(_ context.Context, slug string) error {
	m.OutdatedCalls = append(m.OutdatedCalls, slug)
	return m.Err
}
func (m *MockStore) ListNutritionStatuses(_ context.Context) (map[string]models.NutritionStatus, error) {
	return m.NutritionStatuses, m.Err
}
```

- [ ] **Step 6: Verify build + existing tests**

Run: `cd backend && go build ./... && go test ./internal/... `
Expected: compiles; existing tests pass (the new interface methods are satisfied by both impls).

- [ ] **Step 7: Commit**

```bash
git add backend/internal/db/
git commit -m "feat(db): recipe_nutrition store methods + ai_jobs columns + recipe join"
```

---

## Task 5: Worker — nutrition branch

**Files:**
- Modify: `backend/internal/ai/worker.go`
- Create: `backend/internal/ai/worker_test.go`

- [ ] **Step 1: Write the failing test** — `worker_test.go`

```go
package ai

import (
	"context"
	"testing"

	"backend/internal/db"
	"backend/internal/models"
)

type fakeNutrition struct{ res NutritionResult }

func (f fakeNutrition) Provider() string { return "claude" }
func (f fakeNutrition) Model() string    { return "claude-sonnet-4-6" }
func (f fakeNutrition) Estimate(_ context.Context, _ models.Recipe) (NutritionResult, error) {
	return f.res, nil
}

func TestWorkerNutritionBranch(t *testing.T) {
	slug := "schnitzel"
	store := &db.MockStore{
		NextAIJob: &models.AIJob{ID: "j1", Kind: "nutrition", RecipeSlug: &slug,
			Provider: "claude", Model: "claude-sonnet-4-6", Status: models.AIJobRunning},
		Recipe: &models.Recipe{Slug: slug, Servings: "2 Personen"},
	}
	res := NutritionResult{
		PerRecipe:  models.Macros{Kcal: 1688},
		PerServing: models.Macros{Kcal: 844},
		InputTokens: 100, OutputTokens: 50,
	}
	p := NewWorkerPool(store, WorkerOpts{
		ResolveNutrition: func(_, _ string) (NutritionEstimator, error) {
			return fakeNutrition{res: res}, nil
		},
	})
	if err := p.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(store.SetNutritionCalls) != 1 {
		t.Fatalf("expected 1 SetRecipeNutrition call, got %d", len(store.SetNutritionCalls))
	}
	got := store.SetNutritionCalls[0]
	if got.RecipeSlug != slug || got.PerRecipe.Kcal != 1688 || got.CostUSD <= 0 {
		t.Fatalf("bad stored nutrition: %+v", got)
	}
}
```

> The MockStore needs `ClaimNextAIJob` to return `NextAIJob` once then nil, and `SetAIJobReady` to be a no-op recording success. If the mock's `ClaimNextAIJob`/`SetAIJobReady` don't already behave this way, adjust the mock (return `m.NextAIJob` then set it to nil) — keep it minimal.

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && go test ./internal/ai -run TestWorkerNutritionBranch`
Expected: FAIL — `ResolveNutrition` field unknown / branch not implemented.

- [ ] **Step 3: Implement** — in `worker.go`:

Add to `WorkerOpts`:
```go
	ResolveNutrition func(provider, model string) (NutritionEstimator, error)
```
In `NewWorkerPool`, after the `Resolve` default, add:
```go
	if opts.ResolveNutrition == nil {
		opts.ResolveNutrition = func(provider, model string) (NutritionEstimator, error) {
			return GetNutrition(provider + ":" + model)
		}
	}
```
In `handle`, branch at the very top:
```go
	if job.Kind == "nutrition" {
		p.handleNutrition(ctx, job)
		return
	}
```
Add the method:
```go
func (p *WorkerPool) handleNutrition(ctx context.Context, job *models.AIJob) {
	if job.RecipeSlug == nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "nutrition job missing recipe_slug")
		return
	}
	recipe, err := p.store.GetRecipeBySlug(ctx, *job.RecipeSlug)
	if err != nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "load recipe: "+err.Error())
		return
	}
	if recipe == nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "recipe not found: "+*job.RecipeSlug)
		return
	}
	est, err := p.opts.ResolveNutrition(job.Provider, job.Model)
	if err != nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "model not available: "+err.Error())
		return
	}
	res, err := est.Estimate(ctx, *recipe)
	if err != nil {
		if job.Attempts < p.opts.MaxAttempts {
			_ = p.store.RequeueAIJob(ctx, job.ID)
			return
		}
		_ = p.store.SetAIJobFailed(ctx, job.ID, err.Error())
		return
	}
	cost := CostUSD(est.Provider(), est.Model(), res.InputTokens, res.OutputTokens)
	if err := p.store.SetRecipeNutrition(ctx, models.RecipeNutrition{
		RecipeSlug: *job.RecipeSlug, PerRecipe: res.PerRecipe, PerServing: res.PerServing,
		ServingsUsed: res.ServingsUsed, LineItems: res.LineItems, Model: est.Model(),
		InputTokens: res.InputTokens, OutputTokens: res.OutputTokens, CostUSD: cost,
	}); err != nil {
		_ = p.store.SetAIJobFailed(ctx, job.ID, "store nutrition: "+err.Error())
		return
	}
	_ = p.store.SetAIJobReady(ctx, job.ID,
		map[string]any{"per_recipe": res.PerRecipe}, res.InputTokens, res.OutputTokens, cost)
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && go test ./internal/ai -run TestWorkerNutritionBranch -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/ai/worker.go backend/internal/ai/worker_test.go backend/internal/db/mock_store.go
git commit -m "feat(ai): worker nutrition branch (load recipe, estimate, store, cost)"
```

---

## Task 6: Handlers + routes + outdated hook

**Files:**
- Create: `backend/internal/handlers/admin_recipe_nutrition.go`, `backend/internal/handlers/admin_recipe_nutrition_test.go`
- Modify: `backend/internal/handlers/admin_recipe_status.go` (extend status), `backend/internal/handlers/recipes_write.go` (outdated hook), `backend/main.go`

- [ ] **Step 1: Write failing handler tests** — `admin_recipe_nutrition_test.go`

```go
package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/db"
	"backend/internal/middleware"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
)

func adminReq(method, target string) (*http.Request, *httptest.ResponseRecorder) {
	r := httptest.NewRequest(method, target, nil)
	// route param {slug}
	rc := chi.NewRouteContext()
	rc.URLParams.Add("slug", "schnitzel")
	r = r.WithContext(middleware.WithUser(
		chiCtx(r, rc), &models.User{ID: "admin-1", Role: models.RoleAdmin}))
	return r, httptest.NewRecorder()
}

func TestEnqueueNutrition_RejectsUnconfirmed(t *testing.T) {
	store := &db.MockStore{Confirmed: false}
	r, w := adminReq("POST", "/api/admin/recipes/schnitzel/nutrition")
	EnqueueRecipeNutrition(store)(w, r)
	if w.Code != http.StatusConflict {
		t.Fatalf("want 409 for unconfirmed, got %d", w.Code)
	}
	if store.LastNutritionJobSlug != "" {
		t.Fatal("should not enqueue when unconfirmed")
	}
}

func TestEnqueueNutrition_OK(t *testing.T) {
	store := &db.MockStore{Confirmed: true}
	r, w := adminReq("POST", "/api/admin/recipes/schnitzel/nutrition")
	EnqueueRecipeNutrition(store)(w, r)
	if w.Code != http.StatusAccepted {
		t.Fatalf("want 202, got %d", w.Code)
	}
	if store.LastNutritionJobSlug != "schnitzel" {
		t.Fatalf("expected enqueue for schnitzel, got %q", store.LastNutritionJobSlug)
	}
}
```

> Helpers: this test needs a way to put the slug into chi's route context and the user into the request context. If the existing handler tests (e.g. `admin_recipe_status_test.go`) already have a pattern for these, COPY it exactly (the project may expose `middleware.WithUser` or set the context differently). Read `admin_recipe_status_test.go` and `middleware/auth.go` first and match their approach; replace the `adminReq`/`chiCtx`/`WithUser` helpers above with the project's actual pattern. Do NOT invent a new context key.

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && go test ./internal/handlers -run TestEnqueueNutrition`
Expected: FAIL — `EnqueueRecipeNutrition` undefined.

- [ ] **Step 3: Implement `admin_recipe_nutrition.go`**

```go
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"backend/internal/db"
	mw "backend/internal/middleware"

	"github.com/go-chi/chi/v5"
)

// POST /api/admin/recipes/{slug}/nutrition — enqueue a nutrition job.
// 409 unless the recipe is confirmed (Kalibriert).
func EnqueueRecipeNutrition(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		user := mw.UserFromContext(r.Context())
		if user == nil {
			jsonError(w, "Nicht autorisiert", http.StatusUnauthorized)
			return
		}
		confirmed, err := store.IsRecipeConfirmed(r.Context(), slug)
		if err != nil {
			if errors.Is(err, db.ErrRecipeNotFound) {
				jsonError(w, "Rezept nicht gefunden.", http.StatusNotFound)
				return
			}
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		if !confirmed {
			jsonError(w, "Rezept muss zuerst kalibriert werden.", http.StatusConflict)
			return
		}
		id, err := store.CreateNutritionJob(r.Context(), user.ID, slug)
		if err != nil {
			jsonError(w, "Auftrag fehlgeschlagen", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]string{"job_id": id, "status": "queued"})
	}
}

// GET /api/admin/recipes/{slug}/nutrition — full detail for the admin page.
func GetRecipeNutrition(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		n, err := store.GetRecipeNutrition(r.Context(), slug)
		if err != nil {
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if n == nil {
			json.NewEncoder(w).Encode(map[string]any{"status": "none"})
			return
		}
		json.NewEncoder(w).Encode(n)
	}
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && go test ./internal/handlers -run TestEnqueueNutrition -v`
Expected: PASS.

- [ ] **Step 5: Extend the status endpoint** — in `admin_recipe_status.go`, change `ListRecipeConfirmations` to also return nutrient statuses. Replace its body's response with a combined payload:

```go
		statuses, err := store.ListNutritionStatuses(r.Context())
		if err != nil {
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		if statuses == nil {
			statuses = map[string]models.NutritionStatus{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"confirmed": slugs, "nutrition": statuses})
```

(Add `"backend/internal/models"` to imports.)

- [ ] **Step 6: Outdated hook** — in `recipes_write.go` `UpdateRecipe`, after the successful `store.UpdateRecipe(...)` call, add:

```go
		_ = store.MarkNutritionOutdated(r.Context(), r2.Slug) // r2 = the slug var used in this handler
```
Use whatever the slug variable is named in that handler (likely `chi.URLParam(r, "slug")`). It's best-effort (ignore the error — no row is a no-op).

- [ ] **Step 7: Register routes** — in `main.go`, inside the `RequireAdmin` group, add:

```go
				r.Post("/api/admin/recipes/{slug}/nutrition", handlers.EnqueueRecipeNutrition(store))
				r.Get("/api/admin/recipes/{slug}/nutrition", handlers.GetRecipeNutrition(store))
```

(The extended `/api/admin/recipes/status` route already exists — no change.)

- [ ] **Step 8: Verify + commit**

Run: `cd backend && go build ./... && go test ./internal/...`
Expected: all pass.

```bash
git add backend/internal/handlers/ backend/main.go
git commit -m "feat(api): nutrition enqueue/detail endpoints, status extension, outdated-on-edit"
```

---

## Task 7: Go eval harness (regression gate)

**Files:**
- Create: `backend/cmd/nutrition-eval/main.go`

This ports the Python `exp8` scoring so the gate runs in-repo. It reads the existing `recipes.json` / `recipes_external.json` (already in `backend/cmd/nutrition-eval/`) and the live estimator.

- [ ] **Step 1: Implement `main.go`**

```go
// Command nutrition-eval scores the production estimator against the committed
// ground-truth sets. Usage: go run ./cmd/nutrition-eval [recipes.json|recipes_external.json]
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"

	"backend/internal/ai"
	"backend/internal/models"

	"github.com/joho/godotenv"
)

type evalRecipe struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Servings    any    `json:"servings"`
	Ingredients []struct{ Amount, Name string } `json:"ingredients"`
	Steps       []string `json:"steps"`
	Reference   struct {
		PerRecipe models.Macros `json:"per_recipe"`
	} `json:"reference"`
}

func main() {
	_ = godotenv.Load()
	set := "recipes.json"
	if len(os.Args) > 1 {
		set = os.Args[1]
	}
	path := set
	if !filepath.IsAbs(set) {
		path = filepath.Join("cmd", "nutrition-eval", filepath.Base(set))
	}
	raw, err := os.ReadFile(path)
	if err != nil { panic(err) }
	var recipes []evalRecipe
	if err := json.Unmarshal(raw, &recipes); err != nil { panic(err) }

	est, err := ai.GetNutrition("claude:claude-sonnet-4-6")
	if err != nil { panic(err) }

	var n int
	var sumAbsPct, hits float64
	for _, er := range recipes {
		r := models.Recipe{Title: er.Title, Servings: fmt.Sprint(er.Servings), Steps: er.Steps}
		for _, ing := range er.Ingredients {
			r.Ingredients = append(r.Ingredients, models.Ingredient{Display: ing.Amount, Name: ing.Name})
		}
		res, err := est.Estimate(context.Background(), r)
		if err != nil { fmt.Printf("  FAIL %s: %v\n", er.ID, err); continue }
		ref := er.Reference.PerRecipe.Kcal
		if ref <= 0 { continue }
		pct := (res.PerRecipe.Kcal - ref) / ref * 100
		n++
		sumAbsPct += math.Abs(pct)
		if math.Abs(pct) <= 20 { hits++ }
		fmt.Printf("  %-34s kcal %6.0f vs %6.0f  (%+5.0f%%)\n", trunc(er.Title, 34), res.PerRecipe.Kcal, ref, pct)
	}
	fmt.Printf("\n=== %s: n=%d  kcal MAPE %.1f%%  within20 %.0f%% ===\n",
		set, n, sumAbsPct/float64(n), 100*hits/float64(n))
}

func trunc(s string, n int) string { if len(s) > n { return s[:n] }; return s }
```

- [ ] **Step 2: Run (smoke, costs ~$0.7)**

Run: `cd backend && go run ./cmd/nutrition-eval recipes.json`
Expected: prints per-recipe kcal and a summary; kcal MAPE ≈ 10–14% / within20 ≈ 80%. (This confirms the Go port matches the Python prototype.)

- [ ] **Step 3: Commit**

```bash
git add backend/cmd/nutrition-eval/main.go
git commit -m "feat(nutrition): Go eval harness as the regression gate"
```

---

## Task 8: Frontend — public nutrition card

**Files:**
- Modify: `frontend/lib/api.ts` (add `nutrition` to `Recipe`)
- Create: `frontend/components/nutrition-card.tsx`
- Modify: `frontend/app/rezept/[slug]/detail-client.tsx`

- [ ] **Step 1: Type** — in `api.ts`, add near the `Recipe` interface:

```ts
export interface Macros {
  kcal: number; protein_g: number; fat_g: number
  carbs_g: number; sugar_g: number; fibre_g: number
}
export interface PublicNutrition { per_serving: Macros; outdated?: boolean }
```
and add to `interface Recipe`: `nutrition?: PublicNutrition | null`.

- [ ] **Step 2: Create `nutrition-card.tsx`** (the kcal-hero layout you chose)

```tsx
import type { Macros } from '@/lib/api'

const T = { text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', accent: '#C2410C' }
const g = (n: number) => `${Math.round(n)} g`

export function NutritionCard({ perServing }: { perServing: Macros }) {
  const m = perServing
  return (
    <section aria-label="Nährwerte pro Portion" style={{ border: `1px solid ${T.border}`, borderRadius: 16, padding: 18, background: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 34, fontWeight: 700, color: T.text, lineHeight: 1, fontFamily: "'DM Serif Display', Georgia, serif" }}>
          {Math.round(m.kcal)} <span style={{ fontSize: 16, fontWeight: 600 }}>kcal</span>
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>pro Portion</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, textAlign: 'center' }}>
        {[['Eiweiß', m.protein_g], ['Fett', m.fat_g], ['KH', m.carbs_g]].map(([label, v]) => (
          <div key={label as string} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 4px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{g(v as number)}</div>
            <div style={{ fontSize: 11, color: T.muted }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 10 }}>
        Zucker {g(m.sugar_g)} · Ballaststoffe {g(m.fibre_g)}
      </div>
      <div style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 4, fontStyle: 'italic' }}>
        ≈ geschätzte Werte
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Render it** — read `frontend/app/rezept/[slug]/detail-client.tsx` first to find where the recipe meta/sidebar renders. Import `NutritionCard` and render it where it fits the layout, guarded so the page works with and without data:

```tsx
{recipe.nutrition && <NutritionCard perServing={recipe.nutrition.per_serving} />}
```

(`recipe` is the recipe prop already in that component; `getRecipe` now includes `nutrition`.)

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run build`
Expected: type-checks and builds. Manually: a recipe with a `recipe_nutrition` row shows the card; one without shows nothing.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts frontend/components/nutrition-card.tsx frontend/app/rezept/[slug]/detail-client.tsx
git commit -m "feat(web): per-serving nutrition card on the recipe page"
```

---

## Task 9: Frontend — admin compute control

**Files:**
- Modify: `frontend/lib/api.ts` (client fns), `frontend/app/api/proxy/[...path]/route.ts` (allow paths)
- Modify: `frontend/app/admin/[slug]/page.tsx` (+ `recipe-form.tsx` if the control lives there)

- [ ] **Step 1: Client fns** — in `api.ts`:

```ts
export interface NutritionDetail {
  status?: 'none'
  per_recipe?: Macros; per_serving?: Macros
  cost_usd?: number; outdated?: boolean; computed_at?: string
}
export async function clientComputeNutrition(slug: string): Promise<void> {
  const res = await fetch(`/api/proxy/admin/recipes/${slug}/nutrition`, { method: 'POST' })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Fehler')
}
export async function clientGetNutritionDetail(slug: string): Promise<NutritionDetail> {
  const res = await fetch(`/api/proxy/admin/recipes/${slug}/nutrition`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Fehler')
  return res.json()
}
```

- [ ] **Step 2: Allow the proxy paths** — in `app/api/proxy/[...path]/route.ts`, ensure `admin/recipes` POST/GET subpaths are within `ALLOWED_PREFIXES` (the existing `admin/recipes` prefix likely already covers `{slug}/nutrition`; confirm and add if needed). After a successful POST, no recipe-write revalidation is needed yet (the result is async); revalidation happens in Step 4.

- [ ] **Step 3: The control** — read `frontend/app/admin/[slug]/page.tsx` to see how it renders (and where the Kalibriert control sits). Add a client control that:
  - shows current status via `clientGetNutritionDetail(slug)` on mount,
  - has a "Nährwerte berechnen" button **disabled unless the recipe is confirmed** (the admin page already knows confirmed state via `useAdminConfirmations` or a prop),
  - on click calls `clientComputeNutrition(slug)`, then polls `clientGetNutritionDetail` every ~3 s until a fresh `computed_at` / non-`none` appears,
  - on completion calls `router.refresh()` and triggers cache revalidation (Step 4),
  - shows per-serving kcal + `cost_usd` ("berechnet · $0.02") and a "veraltet" badge when `outdated`.

Implement as a small `NutritionControl` client component colocated with the admin page. (Mirror the spinner/disabled patterns already used by the AI-extraction UI.)

- [ ] **Step 4: Revalidate on completion** — reuse the recipe revalidation path the proxy already uses for recipe writes (it calls `revalidateTag('recipe-<slug>')` + `revalidateTag('recipes')`). Add a tiny POST route (e.g. `app/api/revalidate-recipe/route.ts`) that the control calls on completion, or extend the existing proxy revalidation to accept a manual trigger. Confirm the public page picks up the new card after recompute.

- [ ] **Step 5: Verify + commit**

Run: `cd frontend && npm run build && npm run lint`
```bash
git add frontend/lib/api.ts frontend/app/admin/ frontend/app/api/
git commit -m "feat(admin): compute-nutrition control with polling + revalidate"
```

---

## Task 10: Frontend — admin list nutrient chips + sort

**Files:**
- Create: `frontend/lib/use-nutrition-statuses.ts`
- Modify: `frontend/components/admin/recipe-list.tsx`, `frontend/lib/api.ts`

- [ ] **Step 1: Status hook** — `use-nutrition-statuses.ts`, mirroring `use-admin-confirmations.ts` exactly (admin-gated, hydration-safe, sessionStorage SWR) but reading the `nutrition` map from the **same** `/api/admin/recipes/status` response. Add a client fn in `api.ts`:

```ts
export async function clientGetNutritionStatuses(): Promise<Record<string, 'current' | 'outdated'>> {
  const res = await fetch('/api/proxy/admin/recipes/status', { cache: 'no-store' })
  if (!res.ok) return {}
  const data = await res.json()
  return data.nutrition ?? {}
}
```
The hook exposes `nutritionStatus(slug): 'none' | 'current' | 'outdated'` (default `'none'`).

- [ ] **Step 2: Chips + sort** — in `recipe-list.tsx`:
  - Add `const { nutritionStatus } = useNutritionStatuses()` and a per-row indicator (e.g. a small dot/label: grey "keine", green "Nährwerte", amber "veraltet") next to `CalToggle`.
  - Add a nutrient filter-chip row mirroring the calibration chips: `Alle / Keine / Berechnet / Veraltet`, filtering `filtered` by `nutritionStatus(r.slug)`.
  - Add sort options to the existing `<select value={sort}>`: `Nährwerte fehlend zuerst` (recipes with `none` first) and `Kalibriert zuerst` (confirmed first), implemented in the `filtered` sort block using `isConfirmed`/`nutritionStatus`.

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && npm run build && npm run lint`
```bash
git add frontend/lib/ frontend/components/admin/recipe-list.tsx
git commit -m "feat(admin): nutrient status indicator, filter chips, and sort in recipe list"
```

---

## Task 11: End-to-end verification

- [ ] **Step 1: Full backend test + build**

Run: `cd backend && go build ./... && go test ./...`
Expected: all green.

- [ ] **Step 2: Manual smoke (local)**

With Postgres up and `ANTHROPIC_API_KEY` set: start backend + frontend. As admin: calibrate a recipe → "Nährwerte berechnen" enables → press → status goes läuft → berechnet · $cost. Open the public recipe page → kcal-hero card shows pro Portion. Edit the recipe → admin shows "veraltet", public still shows numbers. Check `/admin/kosten` → the nutrition job's cost is in the totals.

- [ ] **Step 3: Final commit (if any wiring tweaks)**

```bash
git commit -am "chore(nutrition): end-to-end wiring verified"
```

---

## Self-review notes (addressed)

- **Spec coverage:** storage (T1/T4), estimator exp8 (T3), background job + cost (T1/T4/T5), gated manual trigger (T6/T9), outdated-on-edit (T6), per-serving card + estimate note (T8), keep-stale-visible (T4 join always returns the row), admin chips+sort (T10), per-recipe + aggregate cost (T5 stores cost on both ai_job and recipe_nutrition; `/admin/kosten` already sums ai_jobs), no manual override (not built), eval gate (T7). ✓
- **Type consistency:** `Macros`, `NutritionLineItem`, `RecipeNutrition`, `PublicNutrition` used identically across model/store/ai/handlers; `recipe_slug` (not `recipe_id`) everywhere; `kind` values `'extraction'|'nutrition'`. ✓
- **Known executor read-firsts (not placeholders — established patterns to mirror):** the handler-test context helpers (`admin_recipe_status_test.go` + `middleware/auth.go`), the exact `UpdateRecipe` slug variable (`recipes_write.go`), the two big UI files (`detail-client.tsx`, `admin/[slug]/page.tsx`), and the proxy `ALLOWED_PREFIXES`. Each task names the file to read and the snippet to add.
