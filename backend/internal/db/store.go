package db

import (
	"context"
	"time"

	"backend/internal/models"
)

type RecipeFilter struct {
	Category  string
	Query     string
	OwnerID   *string // nil = no filter; "" sentinel = global only; "<uuid>" = that user only
	CreatorID *string // when set, restrict to recipes whose created_by matches
	ViewerID  string  // who is asking (used to populate IsMine; "" = anonymous/internal)
	AdminView bool    // when true, no owner-visibility filter is applied
	Limit     int
	Offset    int
}

type Store interface {
	// Categories
	GetCategories(ctx context.Context) ([]models.Category, error)

	// Recipes (read)
	GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error)
	GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error)
	CountUserRecipes(ctx context.Context, userID string) (int, error)

	// Recipes (write)
	CreateRecipe(ctx context.Context, r models.Recipe) (slug string, err error)
	UpdateRecipe(ctx context.Context, r models.Recipe) error
	DeleteRecipe(ctx context.Context, slug string) error

	// Users
	GetUsers(ctx context.Context) ([]models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	GetUserByID(ctx context.Context, id string) (*models.User, error)
	CreateUser(ctx context.Context, email string, role models.Role) (*models.User, error)
	UpdateUser(ctx context.Context, id string, role models.Role, status models.Status) (*models.User, error)
	DeleteUser(ctx context.Context, id string) error
	UpdateLastLogin(ctx context.Context, id string) error

	// Sessions
	CreateSession(ctx context.Context, userID, token string, expires time.Time, ua, ip string) error
	GetUserBySessionToken(ctx context.Context, token string) (*models.User, error)
	DeleteSession(ctx context.Context, token string) error
	DeleteSessionsByUserID(ctx context.Context, userID string) error

	// AI jobs
	CreateAIJob(ctx context.Context, j models.AIJob, perUserActiveCap, globalActiveCap, dailyCap int) (string, error)
	GetAIJob(ctx context.Context, id string) (*models.AIJob, error)
	ListUserAIJobs(ctx context.Context, userID string, since time.Time) ([]models.AIJob, error)
	ClaimNextAIJob(ctx context.Context) (*models.AIJob, error)
	SetAIJobReady(ctx context.Context, id string, recipeJSON map[string]any, inTokens, outTokens int, costUSD float64) error
	SetAIJobFailed(ctx context.Context, id string, errMsg string) error
	RequeueAIJob(ctx context.Context, id string) error
	DeleteAIJob(ctx context.Context, id, ownerID string) error
	MarkAIJobConsumed(ctx context.Context, id, ownerID string) error
	ResetOrphanedAIJobs(ctx context.Context, maxAttempts int) error
	DeleteOldAIJobs(ctx context.Context, before time.Time) (int, error)
	CountActiveAIJobs(ctx context.Context, userID string) (int, error)
	CountActiveAIJobsGlobal(ctx context.Context) (int, error)
	GetTodayAIUsage(ctx context.Context, userID string) (int, error)
	GetAIStats(ctx context.Context) (*models.AIStats, error)
}
