package db

import (
	"context"

	"backend/internal/models"
)

// MockStore is used in handler unit tests. Set the fields before calling.
type MockStore struct {
	Categories []models.Category
	Recipes    []models.RecipeListItem
	Recipe     *models.Recipe
	Err        error
}

func (m *MockStore) GetCategories(_ context.Context) ([]models.Category, error) {
	return m.Categories, m.Err
}

func (m *MockStore) GetRecipes(_ context.Context, _ RecipeFilter) ([]models.RecipeListItem, error) {
	return m.Recipes, m.Err
}

func (m *MockStore) GetRecipeBySlug(_ context.Context, _ string) (*models.Recipe, error) {
	return m.Recipe, m.Err
}
