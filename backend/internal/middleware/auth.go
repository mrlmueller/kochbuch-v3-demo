package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"backend/internal/db"
	"backend/internal/models"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

type contextKey string

const CtxUser contextKey = "user"

func UserFromContext(ctx context.Context) *models.User {
	u, _ := ctx.Value(CtxUser).(*models.User)
	return u
}

// InitFirebase initialises the Firebase Admin Auth client.
// Reads GOOGLE_APPLICATION_CREDENTIALS env var (path to service-account JSON)
// or FIREBASE_SERVICE_ACCOUNT_JSON env var (inline JSON string).
func InitFirebase(ctx context.Context) (*auth.Client, error) {
	var app *firebase.App
	var err error

	if sa := os.Getenv("FIREBASE_SERVICE_ACCOUNT_JSON"); sa != "" {
		app, err = firebase.NewApp(ctx, nil, option.WithCredentialsJSON([]byte(sa)))
	} else {
		app, err = firebase.NewApp(ctx, nil)
	}
	if err != nil {
		return nil, err
	}
	return app.Auth(ctx)
}

// RequireSession validates the session cookie and injects the User into context.
// Returns 401 if missing/invalid.
//
// If internalToken is non-empty and the request carries a matching
// X-Internal-Token header, the cookie check is bypassed entirely and no user
// is injected into context. This lets the Vercel SSR layer fetch public
// read-only data without a user session. RequireAdmin will still reject such
// requests (nil user → 403), so write endpoints remain protected.
func RequireSession(store db.Store, internalToken string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if internalToken != "" && r.Header.Get("X-Internal-Token") == internalToken {
				next.ServeHTTP(w, r)
				return
			}
			cookie, err := r.Cookie("session")
			if err != nil {
				jsonErr(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			user, err := store.GetUserBySessionToken(r.Context(), cookie.Value)
			if err != nil || user == nil {
				jsonErr(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			if user.Status == models.StatusDeactivated {
				jsonErr(w, "account deactivated", http.StatusForbidden)
				return
			}
			// Touch last_active_at at most every 5 minutes per user.
			// Fire-and-forget so the user request never waits on the write,
			// and use a fresh context so the goroutine survives the request.
			if user.LastActiveAt == nil || time.Since(*user.LastActiveAt) > 5*time.Minute {
				go func(id string) {
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancel()
					_ = store.UpdateLastActive(ctx, id)
				}(user.ID)
			}
			ctx := context.WithValue(r.Context(), CtxUser, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAdmin rejects non-admin users with 403.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil || user.Role != models.RoleAdmin {
			jsonErr(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func jsonErr(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
