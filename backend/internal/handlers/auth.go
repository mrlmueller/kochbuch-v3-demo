package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"backend/internal/db"
	"backend/internal/middleware"
	"backend/internal/models"

	"firebase.google.com/go/v4/auth"
)

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// POST /api/auth/login
// Body: {"id_token": "<firebase-id-token>"}
func Login(store db.Store, firebaseAuth *auth.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			IDToken string `json:"id_token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.IDToken == "" {
			http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
			return
		}

		token, err := firebaseAuth.VerifyIDToken(r.Context(), body.IDToken)
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}
		email, _ := token.Claims["email"].(string)

		user, err := store.GetUserByEmail(r.Context(), email)
		if err != nil || user == nil {
			http.Error(w, `{"error":"not authorized"}`, http.StatusForbidden)
			return
		}
		if user.Status == models.StatusDeactivated {
			http.Error(w, `{"error":"account deactivated"}`, http.StatusForbidden)
			return
		}

		// Single-session enforcement for non-admin
		if user.Role != models.RoleAdmin {
			_ = store.DeleteSessionsByUserID(r.Context(), user.ID)
		}

		sessionToken := generateToken()
		expires := time.Now().Add(30 * 24 * time.Hour)
		if err := store.CreateSession(r.Context(), user.ID, sessionToken, expires,
			r.UserAgent(), r.RemoteAddr); err != nil {
			http.Error(w, `{"error":"server error"}`, http.StatusInternalServerError)
			return
		}
		_ = store.UpdateLastLogin(r.Context(), user.ID)

		http.SetCookie(w, &http.Cookie{
			Name:     "session",
			Value:    sessionToken,
			Expires:  expires,
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteNoneMode,
			Path:     "/",
		})

		w.Header().Set("Content-Type", "application/json")
		type loginResp struct {
			*models.User
			SessionToken string `json:"session_token"`
		}
		json.NewEncoder(w).Encode(loginResp{User: user, SessionToken: sessionToken})
	}
}

// POST /api/auth/logout
func Logout(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err == nil {
			_ = store.DeleteSession(r.Context(), cookie.Value)
		}
		http.SetCookie(w, &http.Cookie{
			Name:     "session",
			Value:    "",
			Expires:  time.Unix(0, 0),
			HttpOnly: true,
			Path:     "/",
		})
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /api/auth/me  (requires RequireSession middleware)
func Me() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := middleware.UserFromContext(r.Context())
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}
