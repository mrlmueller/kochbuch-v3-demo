package db

import (
	"context"

	"backend/internal/models"
)

// RecipeFilter holds optional filter params for GetRecipes.
type RecipeFilter struct {
	Category string
	Query    string
	Limit    int
	Offset   int
}

// Store is the database interface. PostgresStore implements it for production;
// MockStore implements it for handler unit tests.
type Store interface {
	GetCategories(ctx context.Context) ([]models.Category, error)
	GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error)
	GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error)
}
