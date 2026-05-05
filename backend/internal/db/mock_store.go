package db

import (
	"context"
	"time"

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

func (m *MockStore) CreateRecipe(ctx context.Context, r models.Recipe) error  { return nil }
func (m *MockStore) UpdateRecipe(ctx context.Context, r models.Recipe) error  { return nil }
func (m *MockStore) DeleteRecipe(ctx context.Context, slug string) error       { return nil }
func (m *MockStore) GetUsers(ctx context.Context) ([]models.User, error)       { return nil, nil }
func (m *MockStore) GetUserByEmail(ctx context.Context, email string) (*models.User, error) { return nil, nil }
func (m *MockStore) CreateUser(ctx context.Context, email string, role models.Role) (*models.User, error) { return nil, nil }
func (m *MockStore) UpdateUser(ctx context.Context, id string, role models.Role, status models.Status) (*models.User, error) { return nil, nil }
func (m *MockStore) DeleteUser(ctx context.Context, id string) error           { return nil }
func (m *MockStore) UpdateLastLogin(ctx context.Context, id string) error      { return nil }
func (m *MockStore) CreateSession(ctx context.Context, userID, token string, expires time.Time, ua, ip string) error { return nil }
func (m *MockStore) GetUserBySessionToken(ctx context.Context, token string) (*models.User, error) { return nil, nil }
func (m *MockStore) DeleteSession(ctx context.Context, token string) error     { return nil }
func (m *MockStore) DeleteSessionsByUserID(ctx context.Context, userID string) error { return nil }
