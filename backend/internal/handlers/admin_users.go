package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
)

// GET /api/admin/users
func ListUsers(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		users, err := store.GetUsers(r.Context())
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

type userDetailResponse struct {
	User         models.User             `json:"user"`
	RecipeCount  int                     `json:"recipe_count"`
	Recipes      []models.RecipeListItem `json:"recipes"`
	AIUsedToday  int                     `json:"ai_used_today"`
	AIDailyLimit int                     `json:"ai_daily_limit"`
}

// GET /api/admin/users/{id}
// Per-user detail for the admin panel: the recipes this user created plus
// their AI-usage state for today.
func GetUserDetail(store db.Store, lim AIJobLimits) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		user, err := store.GetUserByID(r.Context(), id)
		if err != nil || user == nil {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		recipes, err := store.GetRecipes(r.Context(), db.RecipeFilter{
			CreatorID: &id,
			AdminView: true,
		})
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		if recipes == nil {
			recipes = []models.RecipeListItem{}
		}
		used, _ := store.GetTodayAIUsage(r.Context(), id)
		limit := lim.DailyPerUser
		if override, _ := store.GetTodayAILimitOverride(r.Context(), id); override != nil {
			limit = *override
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(userDetailResponse{
			User:         *user,
			RecipeCount:  len(recipes),
			Recipes:      recipes,
			AIUsedToday:  used,
			AIDailyLimit: limit,
		})
	}
}

// PATCH /api/admin/users/{id}/ai-limit  body: {"limit": 30}
// Sets the user's daily AI-job cap for the current day only; it falls back
// to the server default again at the next UTC day rollover.
func SetUserAILimit(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var body struct {
			Limit int `json:"limit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
			return
		}
		if body.Limit < 0 || body.Limit > 1000 {
			http.Error(w, `{"error":"Limit muss zwischen 0 und 1000 liegen."}`, http.StatusBadRequest)
			return
		}
		if err := store.SetTodayAILimitOverride(r.Context(), id, body.Limit); err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]int{"ai_daily_limit": body.Limit})
	}
}

// POST /api/admin/users  body: {"email":"...","method":"google"|"password"}
//
// method defaults to "google" (allowlist row only; the user signs in with
// Google). "password" additionally provisions a Firebase password account so
// the user can set a password via the reset email; the email is then locked to
// the password method by the login enforcement.
func CreateUser(store db.Store, fb FirebaseProvisioner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email  string `json:"email"`
			Method string `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" {
			http.Error(w, `{"error":"email required"}`, http.StatusBadRequest)
			return
		}
		var method models.AuthMethod
		switch body.Method {
		case "", "google":
			method = models.AuthGoogle
		case "password":
			method = models.AuthPassword
		default:
			http.Error(w, `{"error":"invalid method"}`, http.StatusBadRequest)
			return
		}

		if existing, _ := store.GetUserByEmail(r.Context(), body.Email); existing != nil {
			http.Error(w, `{"error":"Diese E-Mail ist bereits vergeben."}`, http.StatusConflict)
			return
		}

		if method == models.AuthPassword {
			if err := fb.CreatePasswordUser(r.Context(), body.Email); err != nil {
				if errors.Is(err, ErrFirebaseEmailExists) {
					http.Error(w, `{"error":"Diese E-Mail ist bereits vergeben."}`, http.StatusConflict)
					return
				}
				http.Error(w, `{"error":"firebase error"}`, http.StatusInternalServerError)
				return
			}
		}

		user, err := store.CreateUser(r.Context(), body.Email, models.RoleUser, method)
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(user)
	}
}

// PATCH /api/admin/users/{id}  body: {"role":"user|admin","status":"active|deactivated"}
func UpdateUser(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var body struct {
			Role   models.Role   `json:"role"`
			Status models.Status `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
			return
		}
		user, err := store.UpdateUser(r.Context(), id, body.Role, body.Status)
		if err != nil || user == nil {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}

// DELETE /api/admin/users/{id}
func DeleteUser(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := store.DeleteUser(r.Context(), id); err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
