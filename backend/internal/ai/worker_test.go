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

// A successful nutrition job must trigger the frontend revalidation callback
// with the recipe's slug — the public payload changed in the background and
// the cached page would otherwise stay stale for up to a week.
func TestWorkerNutritionRevalidatesRecipe(t *testing.T) {
	slug := "schnitzel"
	store := &db.MockStore{
		NextAIJob: &models.AIJob{ID: "j1", Kind: "nutrition", RecipeSlug: &slug,
			Provider: "claude", Model: "claude-sonnet-4-6", Status: models.AIJobRunning},
		Recipe: &models.Recipe{Slug: slug, Servings: "2 Personen"},
	}
	var revalidated []string
	p := NewWorkerPool(store, WorkerOpts{
		ResolveNutrition: func(_, _ string) (NutritionEstimator, error) {
			return fakeNutrition{res: NutritionResult{PerServing: models.Macros{Kcal: 844}}}, nil
		},
		RevalidateRecipe: func(_ context.Context, s string) { revalidated = append(revalidated, s) },
	})
	if err := p.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(revalidated) != 1 || revalidated[0] != slug {
		t.Fatalf("expected revalidation for %q, got %v", slug, revalidated)
	}
}

// A failing nutrition job must NOT revalidate — nothing public changed.
func TestWorkerNutritionNoRevalidateOnFailure(t *testing.T) {
	slug := "schnitzel"
	store := &db.MockStore{
		NextAIJob: &models.AIJob{ID: "j1", Kind: "nutrition", RecipeSlug: &slug,
			Provider: "claude", Model: "claude-sonnet-4-6", Status: models.AIJobRunning,
			Attempts: 99}, // past MaxAttempts so the error is terminal
	}
	// Recipe nil → "recipe not found" failure path.
	var revalidated []string
	p := NewWorkerPool(store, WorkerOpts{
		ResolveNutrition: func(_, _ string) (NutritionEstimator, error) {
			return fakeNutrition{}, nil
		},
		RevalidateRecipe: func(_ context.Context, s string) { revalidated = append(revalidated, s) },
	})
	if err := p.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(revalidated) != 0 {
		t.Fatalf("expected no revalidation on failure, got %v", revalidated)
	}
}
