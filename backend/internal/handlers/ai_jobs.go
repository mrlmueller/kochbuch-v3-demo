package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"backend/internal/ai"
	"backend/internal/db"
	mw "backend/internal/middleware"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type AIJobLimits struct {
	PerUserActive   int
	GlobalActive    int
	DailyPerUser    int
	DefaultProvider string
	DefaultModel    string
}

type createAIJobBody struct {
	ImageURLs []string `json:"image_urls"`
	Provider  string   `json:"provider,omitempty"`
	Model     string   `json:"model,omitempty"`
}

type aiJobResponse struct {
	ID         string    `json:"id"`
	Status     string    `json:"status"`
	Provider   string    `json:"provider"`
	Model      string    `json:"model"`
	CreatedAt  time.Time `json:"created_at"`
	DailyUsed  int       `json:"daily_used"`
	DailyLimit int       `json:"daily_limit"`
}

func CreateAIJob(store db.Store, lim AIJobLimits) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var body createAIJobBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
			return
		}
		if len(body.ImageURLs) < 1 || len(body.ImageURLs) > 6 {
			jsonError(w, "1 bis 6 Bilder erforderlich.", http.StatusBadRequest)
			return
		}
		for _, u := range body.ImageURLs {
			if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
				jsonError(w, "Ungültige Bild-URL.", http.StatusBadRequest)
				return
			}
		}

		provider, model := lim.DefaultProvider, lim.DefaultModel
		if user.Role == models.RoleAdmin && body.Provider != "" && body.Model != "" {
			if !ai.IsValidKey(body.Provider, body.Model) {
				jsonError(w, "Unbekanntes Modell.", http.StatusBadRequest)
				return
			}
			provider, model = body.Provider, body.Model
		}

		id, err := store.CreateAIJob(r.Context(), models.AIJob{
			UserID:    user.ID,
			Provider:  provider,
			Model:     model,
			ImageURLs: body.ImageURLs,
		}, lim.PerUserActive, lim.GlobalActive, lim.DailyPerUser)

		if err != nil {
			switch {
			case errors.Is(err, db.ErrJobLimitPerUser):
				jsonError429(w, "Du hast bereits die maximale Anzahl laufender KI-Jobs.", 60)
			case errors.Is(err, db.ErrJobLimitGlobal):
				jsonError429(w, "Server ist gerade ausgelastet. Bitte gleich nochmal versuchen.", 60)
			case errors.Is(err, db.ErrJobLimitDaily):
				jsonError429(w, "Tägliches KI-Limit erreicht.", retryAfterUntilUTCMidnight())
			default:
				log.Printf("CreateAIJob: %v", err)
				jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			}
			return
		}
		used, _ := store.GetTodayAIUsage(r.Context(), user.ID)
		dailyLimit := lim.DailyPerUser
		if override, _ := store.GetTodayAILimitOverride(r.Context(), user.ID); override != nil {
			dailyLimit = *override
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(aiJobResponse{
			ID: id, Status: "queued", Provider: provider, Model: model,
			CreatedAt: time.Now(), DailyUsed: used, DailyLimit: dailyLimit,
		})
	}
}

func ListAIJobs(store db.Store, lim AIJobLimits) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		since := time.Now().Add(-24 * time.Hour)
		jobs, err := store.ListUserAIJobs(r.Context(), user.ID, since)
		if err != nil {
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		if jobs == nil {
			jobs = []models.AIJob{}
		}
		used, _ := store.GetTodayAIUsage(r.Context(), user.ID)
		dailyLimit := lim.DailyPerUser
		if override, _ := store.GetTodayAILimitOverride(r.Context(), user.ID); override != nil {
			dailyLimit = *override
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"items":       jobs,
			"daily_used":  used,
			"daily_limit": dailyLimit,
		})
	}
}

func GetAIJob(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		id := chi.URLParam(r, "id")
		job, err := store.GetAIJob(r.Context(), id)
		if err != nil || job == nil || job.UserID != user.ID {
			jsonError(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(job)
	}
}

func DeleteAIJob(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		id := chi.URLParam(r, "id")
		err := store.DeleteAIJob(r.Context(), id, user.ID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				jsonError(w, "not found", http.StatusNotFound)
				return
			}
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func ConsumeAIJob(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := mw.UserFromContext(r.Context())
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		id := chi.URLParam(r, "id")
		if err := store.MarkAIJobConsumed(r.Context(), id, user.ID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				jsonError(w, "not found", http.StatusNotFound)
				return
			}
			jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func jsonError429(w http.ResponseWriter, msg string, retryAfterSec int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	json.NewEncoder(w).Encode(map[string]any{
		"error":               msg,
		"retry_after_seconds": retryAfterSec,
	})
}

func retryAfterUntilUTCMidnight() int {
	now := time.Now().UTC()
	nextMidnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	return int(time.Until(nextMidnight).Seconds())
}
