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
	Ingredient string  `json:"ingredient"`
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
