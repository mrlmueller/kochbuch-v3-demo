package handlers

import (
	"encoding/json"
	"net/http"

	"backend/internal/db"
	"backend/internal/models"
	"github.com/go-chi/chi/v5"
)

func ListRecipes(s db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		f := db.RecipeFilter{
			Category: r.URL.Query().Get("category"),
			Query:    r.URL.Query().Get("q"),
		}
		recipes, err := s.GetRecipes(r.Context(), f)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if recipes == nil {
			recipes = []models.RecipeListItem{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(recipes)
	}
}

func GetRecipe(s db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		recipe, err := s.GetRecipeBySlug(r.Context(), slug)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if recipe == nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(recipe)
	}
}
