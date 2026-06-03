package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"backend/internal/db"
	mw "backend/internal/middleware"

	"github.com/go-chi/chi/v5"
)

// POST /api/admin/recipes/{slug}/nutrition — enqueue a nutrition job.
// 409 unless the recipe is confirmed (Kalibriert).
func EnqueueRecipeNutrition(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		user := mw.UserFromContext(r.Context())
		if user == nil {
			jsonError(w, "Nicht autorisiert", http.StatusUnauthorized)
			return
		}
		confirmed, err := store.IsRecipeConfirmed(r.Context(), slug)
		if err != nil {
			if errors.Is(err, db.ErrRecipeNotFound) {
				jsonError(w, "Rezept nicht gefunden.", http.StatusNotFound)
				return
			}
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		if !confirmed {
			jsonError(w, "Rezept muss zuerst kalibriert werden.", http.StatusConflict)
			return
		}
		id, err := store.CreateNutritionJob(r.Context(), user.ID, slug)
		if err != nil {
			jsonError(w, "Auftrag fehlgeschlagen", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]string{"job_id": id, "status": "queued"})
	}
}

// GET /api/admin/recipes/{slug}/nutrition — full detail for the admin page.
func GetRecipeNutrition(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		n, err := store.GetRecipeNutrition(r.Context(), slug)
		if err != nil {
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if n == nil {
			json.NewEncoder(w).Encode(map[string]any{"status": "none"})
			return
		}
		json.NewEncoder(w).Encode(n)
	}
}
