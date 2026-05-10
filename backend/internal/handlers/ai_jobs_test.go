package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/db"
	"backend/internal/handlers"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func aiRouter(store db.Store, user *models.User) http.Handler {
	r := chi.NewRouter()
	r.Use(injectUser(user))
	r.Post("/api/ai-jobs", handlers.CreateAIJob(store, handlers.AIJobLimits{
		PerUserActive: 3, GlobalActive: 50, DailyPerUser: 20,
		DefaultProvider: "openai", DefaultModel: "gpt-5.4-mini",
	}))
	return r
}

func TestCreateAIJob_userCannotOverrideModel(t *testing.T) {
	store := &db.MockStore{}
	user := &models.User{ID: "u1", Role: models.RoleUser}
	body, _ := json.Marshal(map[string]any{
		"image_urls": []string{"https://example.com/a.jpg"},
		"provider":   "claude",
		"model":      "claude-sonnet-4-6",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/ai-jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	aiRouter(store, user).ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Provider string `json:"provider"`
		Model    string `json:"model"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "openai", resp.Provider)
	assert.Equal(t, "gpt-5.4-mini", resp.Model)
}

func TestCreateAIJob_perUserLimit(t *testing.T) {
	store := &db.MockStore{AIActiveCount: 3}
	user := &models.User{ID: "u1", Role: models.RoleUser}
	body, _ := json.Marshal(map[string]any{"image_urls": []string{"https://example.com/a.jpg"}})
	req := httptest.NewRequest(http.MethodPost, "/api/ai-jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	aiRouter(store, user).ServeHTTP(w, req)

	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}

func TestCreateAIJob_dailyLimit(t *testing.T) {
	store := &db.MockStore{AIUsageToday: 20}
	user := &models.User{ID: "u1", Role: models.RoleUser}
	body, _ := json.Marshal(map[string]any{"image_urls": []string{"https://example.com/a.jpg"}})
	req := httptest.NewRequest(http.MethodPost, "/api/ai-jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	aiRouter(store, user).ServeHTTP(w, req)

	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}

func TestCreateAIJob_imageCountValidated(t *testing.T) {
	store := &db.MockStore{}
	user := &models.User{ID: "u1", Role: models.RoleUser}
	body, _ := json.Marshal(map[string]any{"image_urls": []string{}})
	req := httptest.NewRequest(http.MethodPost, "/api/ai-jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	aiRouter(store, user).ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateAIJob_badImageURL(t *testing.T) {
	store := &db.MockStore{}
	user := &models.User{ID: "u1", Role: models.RoleUser}
	body, _ := json.Marshal(map[string]any{"image_urls": []string{"not-a-url"}})
	req := httptest.NewRequest(http.MethodPost, "/api/ai-jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	aiRouter(store, user).ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
