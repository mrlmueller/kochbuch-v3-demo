package handlers

import (
	"encoding/json"
	"net/http"
	"os"

	"backend/internal/backup"
	"backend/internal/db"
)

// POST /api/admin/backup — admin-only manual trigger of the same routine
// the weekly cron runs. Returns 503 if the GitHub env vars aren't set,
// 502 if GitHub rejects the push, 200 with the snapshot details on success.
func TriggerBackup(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		owner := os.Getenv("BACKUP_GITHUB_OWNER")
		repo := os.Getenv("BACKUP_GITHUB_REPO")
		token := os.Getenv("BACKUP_GITHUB_TOKEN")

		w.Header().Set("Content-Type", "application/json")

		if owner == "" || repo == "" || token == "" {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Backup nicht konfiguriert: BACKUP_GITHUB_OWNER/REPO/TOKEN fehlen",
			})
			return
		}

		result, err := backup.RunOnce(r.Context(), store, owner, repo, token, "manual")
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(result)
	}
}
