package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
)

// POST /api/recipes
func CreateRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var recipe models.Recipe
		if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
			http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
			return
		}
		if recipe.Slug == "" {
			recipe.Slug = slugify(recipe.Title)
		}
		if err := store.CreateRecipe(r.Context(), recipe); err != nil {
			log.Printf("CreateRecipe %q: %v", recipe.Slug, err)
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"slug": recipe.Slug})
	}
}

// PUT /api/recipes/{slug}
func UpdateRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var recipe models.Recipe
		if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
			http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
			return
		}
		recipe.Slug = chi.URLParam(r, "slug")
		if err := store.UpdateRecipe(r.Context(), recipe); err != nil {
			log.Printf("UpdateRecipe %q: %v", recipe.Slug, err)
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /api/recipes/{slug}
func DeleteRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		if err := store.DeleteRecipe(r.Context(), slug); err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func slugify(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else if r == ' ' || r == '-' {
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}
