package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/db"
	"backend/internal/handlers"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
)

func TestEnqueueNutrition_RejectsUnconfirmed(t *testing.T) {
	store := &db.MockStore{Confirmed: false}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "admin-1", Role: models.RoleAdmin}))
	r.Post("/api/admin/recipes/{slug}/nutrition", handlers.EnqueueRecipeNutrition(store))

	req := httptest.NewRequest(http.MethodPost, "/api/admin/recipes/schnitzel/nutrition", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Fatalf("want 409 for unconfirmed, got %d", w.Code)
	}
	if store.LastNutritionJobSlug != "" {
		t.Fatal("should not enqueue when unconfirmed")
	}
}

func TestEnqueueNutrition_OK(t *testing.T) {
	store := &db.MockStore{Confirmed: true}
	r := chi.NewRouter()
	r.Use(injectUser(&models.User{ID: "admin-1", Role: models.RoleAdmin}))
	r.Post("/api/admin/recipes/{slug}/nutrition", handlers.EnqueueRecipeNutrition(store))

	req := httptest.NewRequest(http.MethodPost, "/api/admin/recipes/schnitzel/nutrition", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("want 202, got %d", w.Code)
	}
	if store.LastNutritionJobSlug != "schnitzel" {
		t.Fatalf("expected enqueue for schnitzel, got %q", store.LastNutritionJobSlug)
	}
}
