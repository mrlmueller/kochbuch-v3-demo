package db

import (
	"context"
	"time"

	"backend/internal/models"
)

// MockStore is used in handler unit tests. Set the fields before calling.
type MockStore struct {
	Categories    []models.Category
	Recipes       []models.RecipeListItem
	Recipe        *models.Recipe
	Users         []models.User
	UserByID      *models.User
	UserRecipeN   int
	AIJobs        []models.AIJob
	NextAIJob     *models.AIJob
	AIActiveCount   int
	AIGlobalCount   int
	AIUsageToday    int
	AILimitOverride *int
	CreatedSlug   string
	Err           error
	CreateErr     error
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

func (m *MockStore) CountUserRecipes(_ context.Context, _ string) (int, error) {
	return m.UserRecipeN, m.Err
}

func (m *MockStore) CreateRecipe(_ context.Context, r models.Recipe) (string, error) {
	if m.CreateErr != nil {
		return "", m.CreateErr
	}
	if m.CreatedSlug != "" {
		return m.CreatedSlug, nil
	}
	return r.Slug, nil
}

func (m *MockStore) UpdateRecipe(_ context.Context, _ models.Recipe) error { return m.Err }
func (m *MockStore) DeleteRecipe(_ context.Context, _ string) error        { return m.Err }

func (m *MockStore) GetUsers(_ context.Context) ([]models.User, error) { return m.Users, m.Err }
func (m *MockStore) GetUserByEmail(_ context.Context, _ string) (*models.User, error) {
	return nil, nil
}
func (m *MockStore) GetUserByID(_ context.Context, _ string) (*models.User, error) {
	return m.UserByID, m.Err
}
func (m *MockStore) CreateUser(_ context.Context, _ string, _ models.Role) (*models.User, error) {
	return nil, nil
}
func (m *MockStore) UpdateUser(_ context.Context, _ string, _ models.Role, _ models.Status) (*models.User, error) {
	return nil, nil
}
func (m *MockStore) DeleteUser(_ context.Context, _ string) error      { return nil }
func (m *MockStore) UpdateLastLogin(_ context.Context, _ string) error { return nil }
func (m *MockStore) CreateSession(_ context.Context, _, _ string, _ time.Time, _, _ string) error {
	return nil
}
func (m *MockStore) GetUserBySessionToken(_ context.Context, _ string) (*models.User, error) {
	return nil, nil
}
func (m *MockStore) DeleteSession(_ context.Context, _ string) error          { return nil }
func (m *MockStore) DeleteSessionsByUserID(_ context.Context, _ string) error { return nil }

// AI jobs

func (m *MockStore) CreateAIJob(_ context.Context, j models.AIJob, perUser, global, daily int) (string, error) {
	if m.Err != nil {
		return "", m.Err
	}
	if m.AIActiveCount >= perUser {
		return "", ErrJobLimitPerUser
	}
	if m.AIGlobalCount >= global {
		return "", ErrJobLimitGlobal
	}
	if m.AIUsageToday >= daily {
		return "", ErrJobLimitDaily
	}
	_ = j
	return "mock-id", nil
}

func (m *MockStore) GetAIJob(_ context.Context, id string) (*models.AIJob, error) {
	for i := range m.AIJobs {
		if m.AIJobs[i].ID == id {
			return &m.AIJobs[i], nil
		}
	}
	return nil, m.Err
}

func (m *MockStore) ListUserAIJobs(_ context.Context, _ string, _ time.Time) ([]models.AIJob, error) {
	return m.AIJobs, m.Err
}

func (m *MockStore) ClaimNextAIJob(_ context.Context) (*models.AIJob, error) {
	return m.NextAIJob, m.Err
}

func (m *MockStore) SetAIJobReady(_ context.Context, _ string, _ map[string]any, _, _ int, _ float64) error {
	return m.Err
}
func (m *MockStore) GetAIStats(_ context.Context) (*models.AIStats, error) {
	return &models.AIStats{}, m.Err
}
func (m *MockStore) SetAIJobFailed(_ context.Context, _ string, _ string) error        { return m.Err }
func (m *MockStore) RequeueAIJob(_ context.Context, _ string) error                    { return m.Err }
func (m *MockStore) DeleteAIJob(_ context.Context, _, _ string) error                  { return m.Err }
func (m *MockStore) MarkAIJobConsumed(_ context.Context, _, _ string) error            { return m.Err }
func (m *MockStore) ResetOrphanedAIJobs(_ context.Context, _ int) error                { return m.Err }
func (m *MockStore) DeleteOldAIJobs(_ context.Context, _ time.Time) (int, error)       { return 0, m.Err }
func (m *MockStore) CountActiveAIJobs(_ context.Context, _ string) (int, error) {
	return m.AIActiveCount, m.Err
}
func (m *MockStore) CountActiveAIJobsGlobal(_ context.Context) (int, error) {
	return m.AIGlobalCount, m.Err
}
func (m *MockStore) GetTodayAIUsage(_ context.Context, _ string) (int, error) {
	return m.AIUsageToday, m.Err
}
func (m *MockStore) GetTodayAILimitOverride(_ context.Context, _ string) (*int, error) {
	return m.AILimitOverride, m.Err
}
func (m *MockStore) SetTodayAILimitOverride(_ context.Context, _ string, _ int) error {
	return m.Err
}
