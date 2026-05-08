package backup

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"backend/internal/db"
	"backend/internal/models"
)

// Snapshot is the JSON shape committed to GitHub on each weekly backup.
// version lets future schema changes be detected at restore time.
type Snapshot struct {
	ExportedAt    time.Time         `json:"exported_at"`
	Version       int               `json:"version"`
	RecipeCount   int               `json:"recipe_count"`
	CategoryCount int               `json:"category_count"`
	Categories    []models.Category `json:"categories"`
	Recipes       []models.Recipe   `json:"recipes"`
}

// collectSnapshot fetches every recipe (with full ingredients/steps) and every
// category from the store. Iterates GetRecipeBySlug per slug so we don't need
// to extend the Store interface for one weekly job.
func collectSnapshot(ctx context.Context, store db.Store) (*Snapshot, error) {
	cats, err := store.GetCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("get categories: %w", err)
	}

	list, err := store.GetRecipes(ctx, db.RecipeFilter{Limit: 10_000})
	if err != nil {
		return nil, fmt.Errorf("list recipes: %w", err)
	}

	recipes := make([]models.Recipe, 0, len(list))
	for _, item := range list {
		full, err := store.GetRecipeBySlug(ctx, item.Slug)
		if err != nil {
			return nil, fmt.Errorf("get recipe %s: %w", item.Slug, err)
		}
		if full == nil {
			continue
		}
		recipes = append(recipes, *full)
	}

	return &Snapshot{
		ExportedAt:    time.Now().UTC(),
		Version:       1,
		RecipeCount:   len(recipes),
		CategoryCount: len(cats),
		Categories:    cats,
		Recipes:       recipes,
	}, nil
}

// marshalSnapshot returns the JSON bytes for a snapshot, with stable two-space
// indentation so commits diff cleanly in GitHub.
func marshalSnapshot(s *Snapshot) ([]byte, error) {
	return json.MarshalIndent(s, "", "  ")
}
