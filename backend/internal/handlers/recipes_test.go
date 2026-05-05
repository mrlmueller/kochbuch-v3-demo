package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"backend/internal/db"
	"backend/internal/handlers"
	"backend/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListRecipes_returnsAll(t *testing.T) {
	store := &db.MockStore{
		Recipes: []models.RecipeListItem{
			{Slug: "bolognese", Title: "Bolognese", CategorySlug: "hauptgerichte", TimeMinutes: 30},
		},
	}
	req := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
	w := httptest.NewRecorder()
	handlers.ListRecipes(store)(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var got []models.RecipeListItem
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	require.Len(t, got, 1)
	assert.Equal(t, "bolognese", got[0].Slug)
}

func TestListRecipes_storeError(t *testing.T) {
	store := &db.MockStore{Err: fmt.Errorf("db down")}
	req := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
	w := httptest.NewRecorder()
	handlers.ListRecipes(store)(w, req)
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestGetRecipe_found(t *testing.T) {
	store := &db.MockStore{
		Recipe: &models.Recipe{
			Slug:        "bolognese",
			Title:       "Bolognese",
			TimeMinutes: 30,
			Ingredients: []models.Ingredient{{Amount: 500, Unit: "g", Display: "500 g", Name: "Hackfleisch"}},
			Steps:       []string{"Schritt 1"},
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
	}

	r := chi.NewRouter()
	r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))
	req := httptest.NewRequest(http.MethodGet, "/api/recipes/bolognese", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var got models.Recipe
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	assert.Equal(t, "bolognese", got.Slug)
	assert.Equal(t, "Hackfleisch", got.Ingredients[0].Name)
}

func TestGetRecipe_notFound(t *testing.T) {
	store := &db.MockStore{Recipe: nil}
	r := chi.NewRouter()
	r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))
	req := httptest.NewRequest(http.MethodGet, "/api/recipes/does-not-exist", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}
