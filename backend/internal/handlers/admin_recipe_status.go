package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
)

// GET /api/admin/recipes/status
// Admin-only. Returns the slugs of recipes that have been hand-confirmed
// (calibrated). Kept separate from the public recipe payloads so the shared
// static cache and the non-admin experience stay byte-identical.
func ListRecipeConfirmations(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slugs, err := store.ListConfirmedSlugs(r.Context())
		if err != nil {
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		if slugs == nil {
			slugs = []string{}
		}
		statuses, err := store.ListNutritionStatuses(r.Context())
		if err != nil {
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		if statuses == nil {
			statuses = map[string]models.NutritionStatus{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"confirmed": slugs, "nutrition": statuses})
	}
}

// PATCH /api/admin/recipes/{slug}/confirm  body: {"confirmed": bool}
// Admin-only. Sets or clears the recipe's calibration-confirmed flag.
func SetRecipeConfirmed(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var body struct {
			Confirmed bool `json:"confirmed"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
			return
		}
		if err := store.SetRecipeConfirmed(r.Context(), slug, body.Confirmed); err != nil {
			if errors.Is(err, db.ErrRecipeNotFound) {
				jsonError(w, "Rezept nicht gefunden.", http.StatusNotFound)
				return
			}
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"confirmed": body.Confirmed})
	}
}
