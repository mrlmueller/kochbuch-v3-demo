package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"backend/internal/db"
)

// GET /api/admin/ai-stats — admin-only AI usage aggregates for the Kosten page.
func GetAIStats(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stats, err := store.GetAIStats(r.Context())
		if err != nil {
			log.Printf("GetAIStats: %v", err)
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(stats)
	}
}
