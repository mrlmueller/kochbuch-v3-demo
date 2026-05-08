package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// POST /api/recipes
func CreateRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var recipe models.Recipe
		if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
			jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
			return
		}
		if recipe.Slug == "" {
			recipe.Slug = slugify(recipe.Title)
		}
		if err := store.CreateRecipe(r.Context(), recipe); err != nil {
			log.Printf("CreateRecipe %q: %v", recipe.Slug, err)
			writeDbError(w, err)
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
			jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
			return
		}
		recipe.Slug = chi.URLParam(r, "slug")
		if err := store.UpdateRecipe(r.Context(), recipe); err != nil {
			log.Printf("UpdateRecipe %q: %v", recipe.Slug, err)
			writeDbError(w, err)
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
			log.Printf("DeleteRecipe %q: %v", slug, err)
			writeDbError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// writeDbError maps PostgreSQL constraint violations to meaningful HTTP responses.
func writeDbError(w http.ResponseWriter, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation
			jsonError(w, "Ein Rezept mit diesem Slug existiert bereits.", http.StatusConflict)
			return
		case "23503": // foreign_key_violation
			jsonError(w, "Die gewählte Kategorie existiert nicht.", http.StatusBadRequest)
			return
		case "23502": // not_null_violation
			jsonError(w, "Pflichtfeld fehlt: "+pgErr.ColumnName, http.StatusBadRequest)
			return
		}
	}
	jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
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
