package ai

import (
	"context"
	"errors"
	"strings"

	"backend/internal/models"
)

type Request struct {
	ImageURLs  []string
	Locale     string
	Categories []string
}

type Result struct {
	Title        string              `json:"title"`
	CategorySlug string              `json:"category_slug"`
	TimeMinutes  int                 `json:"time_minutes"`
	Servings     string              `json:"servings"`
	Ingredients  []models.Ingredient `json:"ingredients"`
	Steps        []string            `json:"steps"`
	Notes        string              `json:"notes"`
	Confidence   float64             `json:"confidence,omitempty"`
	InputTokens  int                 `json:"-"`
	OutputTokens int                 `json:"-"`
}

type Extractor interface {
	Extract(ctx context.Context, req Request) (Result, error)
	Provider() string
	Model() string
}

type Constructor func() (Extractor, error)

// Registry keys are "provider:model".
var Registry = map[string]Constructor{}

func Register(key string, c Constructor) { Registry[key] = c }

func Get(key string) (Extractor, error) {
	c, ok := Registry[key]
	if !ok {
		return nil, errors.New("unknown model: " + key)
	}
	return c()
}

func IsValidKey(provider, model string) bool {
	_, ok := Registry[provider+":"+model]
	return ok
}

// PromptTemplate returns the system prompt with the given category list injected.
func PromptTemplate(categories []string) string {
	return "Du bist ein Rezept-Extraktor. Analysiere die Bilder und schreibe ein vollständiges deutsches Rezept im JSON-Format. " +
		"Kategorien dürfen NUR aus dieser Liste stammen: [" + strings.Join(categories, ", ") + "]. " +
		"Bei mehreren Bildern: gehe davon aus, dass sie dasselbe Gericht aus verschiedenen Winkeln zeigen. " +
		"Schätze Mengen für 4 Personen, sofern nicht anders erkennbar. " +
		"Antworte ausschließlich mit dem JSON-Schema."
}

// RecipeSchema returns the JSON schema used by both providers.
// `categories` constrains the allowed category_slug values.
func RecipeSchema(categories []string) map[string]any {
	catEnum := make([]any, 0, len(categories))
	for _, c := range categories {
		catEnum = append(catEnum, c)
	}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"title":         map[string]any{"type": "string"},
			"category_slug": map[string]any{"type": "string", "enum": catEnum},
			"time_minutes":  map[string]any{"type": "integer", "minimum": 0},
			"servings":      map[string]any{"type": "string"},
			"ingredients": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type":                 "object",
					"properties":           map[string]any{"display": map[string]any{"type": "string"}, "name": map[string]any{"type": "string"}},
					"required":             []any{"display", "name"},
					"additionalProperties": false,
				},
			},
			"steps": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"notes": map[string]any{"type": "string"},
		},
		"required":             []any{"title", "category_slug", "time_minutes", "servings", "ingredients", "steps", "notes"},
		"additionalProperties": false,
	}
}
