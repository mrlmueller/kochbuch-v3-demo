package handlers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"backend/internal/db"
	"backend/internal/handlers"
	mw "backend/internal/middleware"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// injectUser is a tiny middleware to put a user into request context for tests.
func injectUser(u *models.User) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), mw.CtxUser, u)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

type recipesResp struct {
	Items []models.RecipeListItem `json:"items"`
	Meta  struct {
		MyRecipeCount int `json:"my_recipe_count"`
	} `json:"meta"`
}

func TestListRecipes_returnsAll(t *testing.T) {
	store := &db.MockStore{
		Recipes: []models.RecipeListItem{
			{Slug: "bolognese", Title: "Bolognese", CategorySlug: "hauptgerichte", TimeMinutes: 30},
		},
	}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "u1", Role: models.RoleUser}))
	r.Get("/api/recipes", handlers.ListRecipes(store))

	req := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp recipesResp
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	require.Len(t, resp.Items, 1)
	assert.Equal(t, "bolognese", resp.Items[0].Slug)
}

func TestListRecipes_authedUser_seesGlobalAndOwn(t *testing.T) {
	store := &db.MockStore{
		Recipes: []models.RecipeListItem{
			{Slug: "global", Title: "Global"},
			{Slug: "mine", Title: "Mine"},
		},
		UserRecipeN: 1,
	}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "u1", Role: models.RoleUser}))
	r.Get("/api/recipes", handlers.ListRecipes(store))

	req := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp recipesResp
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp.Items, 2)
	assert.Equal(t, 1, resp.Meta.MyRecipeCount)
}

func TestListRecipes_storeError(t *testing.T) {
	store := &db.MockStore{Err: fmt.Errorf("db down")}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "u1", Role: models.RoleUser}))
	r.Get("/api/recipes", handlers.ListRecipes(store))

	req := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestGetRecipe_globalRecipe_returns200(t *testing.T) {
	store := &db.MockStore{
		Recipe: &models.Recipe{
			Slug:        "bolognese",
			Title:       "Bolognese",
			TimeMinutes: 30,
			Ingredients: []models.Ingredient{{Amount: 500, Unit: "g", Display: "500 g", Name: "Hackfleisch"}},
			Steps:       []string{"Schritt 1"},
			OwnerID:     nil,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
	}

	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "u1", Role: models.RoleUser}))
	r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))
	req := httptest.NewRequest(http.MethodGet, "/api/recipes/bolognese", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var got models.Recipe
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	assert.Equal(t, "bolognese", got.Slug)
	assert.False(t, got.IsMine)
}

func TestGetRecipe_otherUsersRecipe_404(t *testing.T) {
	otherID := "u2"
	store := &db.MockStore{
		Recipe: &models.Recipe{
			Slug:    "private",
			Title:   "Private",
			OwnerID: &otherID,
		},
	}

	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "u1", Role: models.RoleUser}))
	r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))
	req := httptest.NewRequest(http.MethodGet, "/api/recipes/private", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetRecipe_ownRecipe_setsIsMine(t *testing.T) {
	uid := "u1"
	store := &db.MockStore{
		Recipe: &models.Recipe{
			Slug:    "mine",
			Title:   "Mine",
			OwnerID: &uid,
		},
	}

	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: uid, Role: models.RoleUser}))
	r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))
	req := httptest.NewRequest(http.MethodGet, "/api/recipes/mine", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var got models.Recipe
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	assert.True(t, got.IsMine)
}

func TestGetRecipe_notFound(t *testing.T) {
	store := &db.MockStore{Recipe: nil}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "u1", Role: models.RoleUser}))
	r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))
	req := httptest.NewRequest(http.MethodGet, "/api/recipes/does-not-exist", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}
