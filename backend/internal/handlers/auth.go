package handlers

import (
	"context"
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

// normalizeProvider maps a Firebase sign_in_provider claim to our auth_method enum.
func normalizeProvider(p string) (models.AuthMethod, bool) {
	switch p {
	case "google.com":
		return models.AuthGoogle, true
	case "password":
		return models.AuthPassword, true
	default:
		return "", false
	}
}

// resolveUser applies the allowlist, status, and per-email method lock for an
// authenticated identity. Returns (user, 0, "") on success, or (nil, status, code)
// on failure, where code is a machine-readable hint the UI can map to a message
// ("use_google"/"use_password"/"not authorized"/...).
//
// The method lock is the security core: an email is google XOR password forever.
// A NULL auth_method (un-backfilled legacy row) is locked to the provider used
// on this first login.
func resolveUser(ctx context.Context, store db.Store, email, provider string) (*models.User, int, string) {
	method, ok := normalizeProvider(provider)
	if !ok {
		return nil, http.StatusUnauthorized, "invalid token"
	}
	user, err := store.GetUserByEmail(ctx, email)
	if err != nil || user == nil {
		return nil, http.StatusForbidden, "not authorized"
	}
	if user.Status == models.StatusDeactivated {
		return nil, http.StatusForbidden, "account deactivated"
	}
	if user.AuthMethod == nil {
		if err := store.SetUserAuthMethod(ctx, user.ID, method); err != nil {
			return nil, http.StatusInternalServerError, "server error"
		}
		m := method
		user.AuthMethod = &m
	} else if *user.AuthMethod != method {
		return nil, http.StatusForbidden, "use_" + string(*user.AuthMethod)
	}
	return user, 0, ""
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

		user, status, code := resolveUser(r.Context(), store, email, token.Firebase.SignInProvider)
		if user == nil {
			http.Error(w, `{"error":"`+code+`"}`, status)
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
