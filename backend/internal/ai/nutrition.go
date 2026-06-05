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
	// Production nutrition model: opus-4-8 at high effort measured best on the
	// 29-recipe eval (9.0% vs sonnet's 12.0% kcal MAPE; 24/29 vs 22/29 within
	// ±20%) and is ~1.8x faster. See cmd/nutrition-modeleval.
	RegisterNutrition("claude:claude-opus-4-8", func() (NutritionEstimator, error) {
		return newClaudeNutritionCfg("claude-opus-4-8", "high"), nil
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
	effort string // "" → omit output_config.effort (provider default); else low|medium|high|xhigh|max
	client *anthropic.Client
}

func newClaudeNutrition(model string) NutritionEstimator {
	return newClaudeNutritionCfg(model, "")
}

// NewClaudeNutrition builds a nutrition estimator with an explicit model and
// effort level. Production registers concrete configs in init(); the
// model-comparison CLI (cmd/nutrition-modeleval) uses this to try combos.
func NewClaudeNutrition(model, effort string) NutritionEstimator {
	return newClaudeNutritionCfg(model, effort)
}

func newClaudeNutritionCfg(model, effort string) NutritionEstimator {
	key := os.Getenv("ANTHROPIC_API_KEY")
	if key == "" {
		return &claudeNutrition{model: model, effort: effort}
	}
	c := anthropic.NewClient(option.WithAPIKey(key))
	return &claudeNutrition{model: model, effort: effort, client: &c}
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

	// Higher effort can spend more reasoning tokens; give those runs headroom so
	// the finalize call isn't truncated (effort "" keeps the proven 4096).
	maxTok := int64(4096)
	if e.effort != "" {
		maxTok = 16384
	}
	params := anthropic.MessageNewParams{
		Model:     anthropic.Model(e.model),
		MaxTokens: maxTok,
		System:    []anthropic.TextBlockParam{{Text: nutritionSystem}},
		Messages: []anthropic.MessageParam{{
			Role:    anthropic.MessageParamRoleUser,
			Content: []anthropic.ContentBlockParamUnion{anthropic.NewTextBlock(nutritionRecipeText(r))},
		}},
		Tools: []anthropic.ToolUnionParam{{OfTool: &tool}},
		// tool_choice auto: lets the model reason (CoT) before finalize.
	}
	if e.effort != "" {
		params.OutputConfig = anthropic.OutputConfigParam{Effort: anthropic.OutputConfigEffort(e.effort)}
	}
	msg, err := e.client.Messages.New(ctx, params)
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
