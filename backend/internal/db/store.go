package db

import (
	"context"
	"time"

	"backend/internal/models"
)

type RecipeFilter struct {
	Category string
	Query    string
	Limit    int
	Offset   int
}

type Store interface {
	// Recipes (read)
	GetCategories(ctx context.Context) ([]models.Category, error)
	GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error)
	GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error)
	// Recipes (write)
	CreateRecipe(ctx context.Context, r models.Recipe) error
	UpdateRecipe(ctx context.Context, r models.Recipe) error
	DeleteRecipe(ctx context.Context, slug string) error
	// Users
	GetUsers(ctx context.Context) ([]models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	CreateUser(ctx context.Context, email string, role models.Role) (*models.User, error)
	UpdateUser(ctx context.Context, id string, role models.Role, status models.Status) (*models.User, error)
	DeleteUser(ctx context.Context, id string) error
	UpdateLastLogin(ctx context.Context, id string) error
	// Sessions
	CreateSession(ctx context.Context, userID, token string, expires time.Time, ua, ip string) error
	GetUserBySessionToken(ctx context.Context, token string) (*models.User, error)
	DeleteSession(ctx context.Context, token string) error
	DeleteSessionsByUserID(ctx context.Context, userID string) error
}
