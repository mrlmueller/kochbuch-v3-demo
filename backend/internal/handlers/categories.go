package handlers

import (
	"encoding/json"
	"net/http"

	"backend/internal/db"
)

func ListCategories(s db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cats, err := s.GetCategories(r.Context())
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cats)
	}
}
