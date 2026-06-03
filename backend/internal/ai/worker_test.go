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
		PerRecipe:    models.Macros{Kcal: 1688},
		PerServing:   models.Macros{Kcal: 844},
		InputTokens:  100,
		OutputTokens: 50,
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
