# Auth, Admin UI & Design Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firebase authentication (Google OAuth + email/password), single-session enforcement for regular users, full admin dashboard (recipe CRUD + user management), and UI improvements (skeletons, last-recipe card, magazine detail layout).

**Architecture:** Firebase handles identity; Go backend verifies Firebase ID tokens and stores sessions in PostgreSQL for single-session enforcement. All routes are login-gated via Next.js middleware. Admin created via `cmd/create-admin`. Regular users must be pre-approved (email added by admin). Hardcoded theme: Warm, Cover browse layout, Magazine detail layout.

**Tech Stack:** Firebase Auth JS SDK v10 (frontend), Firebase Admin Go SDK v4 (backend token verification), PostgreSQL sessions table, httpOnly cookies (`SameSite=Lax`), Next.js 16 App Router middleware, chi v5, goose migrations.

---

## File Map

**Backend — new files:**
- `migrations/0003_auth.sql`
- `internal/models/user.go`
- `internal/db/users.go`
- `internal/db/sessions.go`
- `internal/handlers/auth.go`
- `internal/handlers/admin_users.go`
- `internal/handlers/recipes_write.go`
- `internal/middleware/auth.go`
- `cmd/create-admin/main.go`

**Backend — modified:**
- `internal/db/store.go` (extend Store interface)
- `internal/db/recipes.go` (add Create/Update/Delete)
- `internal/db/mock_store.go` (stub new methods)
- `main.go` (Firebase init, new routes)
- `go.mod` / `go.sum`

**Frontend — new files:**
- `middleware.ts`
- `lib/firebase.ts`
- `app/login/page.tsx`
- `app/admin/users/page.tsx`
- `components/admin/recipe-list.tsx`
- `components/skeleton.tsx`

**Frontend — modified:**
- `lib/api.ts` (forward session cookie, handle 401)
- `app/admin/layout.tsx` (sidebar nav + role guard)
- `app/admin/page.tsx` (recipe list via recipe-list.tsx)
- `app/admin/recipe-form.tsx` (full redesign)
- `app/admin/neu/page.tsx`
- `app/admin/[slug]/page.tsx`
- `app/page.tsx` (last-recipe card)
- `app/rezept/[slug]/detail-client.tsx` (magazine step numbers)
- `package.json`

---

## Task 1: DB Migration — users and sessions tables

**Files:**
- Create: `backend/migrations/0003_auth.sql`

- [ ] Create the migration file:

```sql
-- +goose Up
CREATE TABLE users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL UNIQUE,
  role       TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  status     TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','deactivated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login TIMESTAMPTZ
);

CREATE TABLE sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  ip         TEXT
);
CREATE INDEX ON sessions(token);
CREATE INDEX ON sessions(user_id);

-- +goose Down
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
```

- [ ] Start the backend to verify goose applies the migration with no errors:
```
cd backend && go run . 2>&1 | head -5
```
Expected: `migrations OK` then `server listening on :8080`

- [ ] Commit: `git add backend/migrations/0003_auth.sql && git commit -m "feat(db): add users and sessions tables"`

---

## Task 2: User model + extend Store interface

**Files:**
- Create: `backend/internal/models/user.go`
- Modify: `backend/internal/db/store.go`

- [ ] Create `backend/internal/models/user.go`:

```go
package models

import "time"

type Role   string
type Status string

const (
	RoleAdmin Role   = "admin"
	RoleUser  Role   = "user"
	StatusActive      Status = "active"
	StatusDeactivated Status = "deactivated"
)

type User struct {
	ID        string     `json:"id"`
	Email     string     `json:"email"`
	Role      Role       `json:"role"`
	Status    Status     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	LastLogin *time.Time `json:"last_login,omitempty"`
}
```

- [ ] Add to `backend/internal/db/store.go` (replace entire file):

```go
package db

import (
	"context"
	"time"

	"backend/internal/models"
)

type RecipeFilter struct {
	Category string
	Query    string
	Limit    int
	Offset   int
}

type Store interface {
	// Recipes (read)
	GetCategories(ctx context.Context) ([]models.Category, error)
	GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error)
	GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error)
	// Recipes (write)
	CreateRecipe(ctx context.Context, r models.Recipe) error
	UpdateRecipe(ctx context.Context, r models.Recipe) error
	DeleteRecipe(ctx context.Context, slug string) error
	// Users
	GetUsers(ctx context.Context) ([]models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	CreateUser(ctx context.Context, email string, role models.Role) (*models.User, error)
	UpdateUser(ctx context.Context, id string, role models.Role, status models.Status) (*models.User, error)
	DeleteUser(ctx context.Context, id string) error
	UpdateLastLogin(ctx context.Context, id string) error
	// Sessions
	CreateSession(ctx context.Context, userID, token string, expires time.Time, ua, ip string) error
	GetUserBySessionToken(ctx context.Context, token string) (*models.User, error)
	DeleteSession(ctx context.Context, token string) error
	DeleteSessionsByUserID(ctx context.Context, userID string) error
}
```

- [ ] Commit: `git commit -am "feat(models): User type and extended Store interface"`

---

## Task 3: Implement DB methods — users and sessions

**Files:**
- Create: `backend/internal/db/users.go`
- Create: `backend/internal/db/sessions.go`
- Modify: `backend/internal/db/mock_store.go`

- [ ] Create `backend/internal/db/users.go`:

```go
package db

import (
	"context"
	"errors"
	"time"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) GetUsers(ctx context.Context) ([]models.User, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, email, role, status, created_at, last_login FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := make([]models.User, 0)
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *PostgresStore) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, role, status, created_at, last_login FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *PostgresStore) CreateUser(ctx context.Context, email string, role models.Role) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, role) VALUES ($1, $2)
		 RETURNING id, email, role, status, created_at, last_login`,
		email, role).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin)
	return &u, err
}

func (s *PostgresStore) UpdateUser(ctx context.Context, id string, role models.Role, status models.Status) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx,
		`UPDATE users SET role=$2, status=$3 WHERE id=$1
		 RETURNING id, email, role, status, created_at, last_login`,
		id, role, status).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *PostgresStore) DeleteUser(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) UpdateLastLogin(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `UPDATE users SET last_login = now() WHERE id = $1`, id)
	return err
}
```

- [ ] Create `backend/internal/db/sessions.go`:

```go
package db

import (
	"context"
	"errors"
	"time"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) CreateSession(ctx context.Context, userID, token string, expires time.Time, ua, ip string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (user_id, token, expires_at, user_agent, ip) VALUES ($1,$2,$3,$4,$5)`,
		userID, token, expires, ua, ip)
	return err
}

func (s *PostgresStore) GetUserBySessionToken(ctx context.Context, token string) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.email, u.role, u.status, u.created_at, u.last_login
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token = $1 AND s.expires_at > now()`, token).
		Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *PostgresStore) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return err
}

func (s *PostgresStore) DeleteSessionsByUserID(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}
```

- [ ] Add stub methods to `backend/internal/db/mock_store.go` so it still compiles. Add after existing stubs:

```go
func (m *MockStore) CreateRecipe(ctx context.Context, r models.Recipe) error  { return nil }
func (m *MockStore) UpdateRecipe(ctx context.Context, r models.Recipe) error  { return nil }
func (m *MockStore) DeleteRecipe(ctx context.Context, slug string) error       { return nil }
func (m *MockStore) GetUsers(ctx context.Context) ([]models.User, error)       { return nil, nil }
func (m *MockStore) GetUserByEmail(ctx context.Context, email string) (*models.User, error) { return nil, nil }
func (m *MockStore) CreateUser(ctx context.Context, email string, role models.Role) (*models.User, error) { return nil, nil }
func (m *MockStore) UpdateUser(ctx context.Context, id string, role models.Role, status models.Status) (*models.User, error) { return nil, nil }
func (m *MockStore) DeleteUser(ctx context.Context, id string) error           { return nil }
func (m *MockStore) UpdateLastLogin(ctx context.Context, id string) error      { return nil }
func (m *MockStore) CreateSession(ctx context.Context, userID, token string, expires time.Time, ua, ip string) error { return nil }
func (m *MockStore) GetUserBySessionToken(ctx context.Context, token string) (*models.User, error) { return nil, nil }
func (m *MockStore) DeleteSession(ctx context.Context, token string) error     { return nil }
func (m *MockStore) DeleteSessionsByUserID(ctx context.Context, userID string) error { return nil }
```

- [ ] `go build ./...` from `backend/` — must compile clean.
- [ ] Commit: `git commit -am "feat(db): implement users and sessions DB methods"`

---

## Task 4: Recipe write DB methods

**Files:**
- Modify: `backend/internal/db/recipes.go`

- [ ] Append to `backend/internal/db/recipes.go`:

```go
func (s *PostgresStore) CreateRecipe(ctx context.Context, r models.Recipe) error {
	ingredientsJSON, _ := json.Marshal(r.Ingredients)
	stepsJSON, _ := json.Marshal(r.Steps)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO recipes
		  (slug, title, category_slug, time_minutes, servings,
		   ingredients, steps, notes, image_url, image_blurhash)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		r.Slug, r.Title, r.CategorySlug, r.TimeMinutes, r.Servings,
		ingredientsJSON, stepsJSON, r.Notes, r.ImageURL, r.ImageBlurhash)
	return err
}

func (s *PostgresStore) UpdateRecipe(ctx context.Context, r models.Recipe) error {
	ingredientsJSON, _ := json.Marshal(r.Ingredients)
	stepsJSON, _ := json.Marshal(r.Steps)
	_, err := s.pool.Exec(ctx, `
		UPDATE recipes SET
		  title=$2, category_slug=$3, time_minutes=$4, servings=$5,
		  ingredients=$6, steps=$7, notes=$8, image_url=$9,
		  image_blurhash=$10, updated_at=now()
		WHERE slug=$1`,
		r.Slug, r.Title, r.CategorySlug, r.TimeMinutes, r.Servings,
		ingredientsJSON, stepsJSON, r.Notes, r.ImageURL, r.ImageBlurhash)
	return err
}

func (s *PostgresStore) DeleteRecipe(ctx context.Context, slug string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM recipes WHERE slug = $1`, slug)
	return err
}
```

- [ ] `go build ./...` — must compile clean.
- [ ] Commit: `git commit -am "feat(db): recipe write methods"`

---

## Task 5: Firebase Admin SDK + auth middleware

**Files:**
- Create: `backend/internal/middleware/auth.go`
- Modify: `backend/go.mod`

- [ ] Add Firebase dependency:
```
cd backend && go get firebase.google.com/go/v4@latest
```

- [ ] Create `backend/internal/middleware/auth.go`:

```go
package middleware

import (
	"context"
	"encoding/json"
	"net/http"

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

	if sa := getenv("FIREBASE_SERVICE_ACCOUNT_JSON"); sa != "" {
		app, err = firebase.NewApp(ctx, nil, option.WithCredentialsJSON([]byte(sa)))
	} else {
		app, err = firebase.NewApp(ctx, nil) // falls back to GOOGLE_APPLICATION_CREDENTIALS
	}
	if err != nil {
		return nil, err
	}
	return app.Auth(ctx)
}

func getenv(key string) string {
	// avoid importing os in the package header
	return envGet(key)
}

var envGet = func(key string) string {
	// set from main.go via middleware.SetEnvGetter; avoids circular imports
	return ""
}

// RequireSession validates the session cookie and injects the User into context.
// Returns 401 if missing/invalid.
func RequireSession(store db.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
```

- [ ] `go build ./...` — must compile clean.
- [ ] Commit: `git commit -am "feat(middleware): session auth + admin guard + Firebase init"`

---

## Task 6: Auth handlers (login / logout / me)

**Files:**
- Create: `backend/internal/handlers/auth.go`

- [ ] Create `backend/internal/handlers/auth.go`:

```go
package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
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

		secure := os.Getenv("APP_ENV") == "production"
		http.SetCookie(w, &http.Cookie{
			Name:     "session",
			Value:    sessionToken,
			Expires:  expires,
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteLaxMode,
			Path:     "/",
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
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
```

- [ ] `go build ./...` — must compile clean.
- [ ] Commit: `git commit -am "feat(handlers): login/logout/me auth handlers"`

---

## Task 7: Admin user handlers + recipe write handlers

**Files:**
- Create: `backend/internal/handlers/admin_users.go`
- Create: `backend/internal/handlers/recipes_write.go`

- [ ] Create `backend/internal/handlers/admin_users.go`:

```go
package handlers

import (
	"encoding/json"
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

// POST /api/admin/users  body: {"email":"..."}
func CreateUser(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" {
			http.Error(w, `{"error":"email required"}`, http.StatusBadRequest)
			return
		}
		user, err := store.CreateUser(r.Context(), body.Email, models.RoleUser)
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
```

- [ ] Create `backend/internal/handlers/recipes_write.go`:

```go
package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
)

// POST /api/recipes
func CreateRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var recipe models.Recipe
		if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
			http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
			return
		}
		if recipe.Slug == "" {
			recipe.Slug = slugify(recipe.Title)
		}
		if err := store.CreateRecipe(r.Context(), recipe); err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"slug": recipe.Slug})
	}
}

// PUT /api/recipes/{slug}
func UpdateRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var recipe models.Recipe
		if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
			http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
			return
		}
		recipe.Slug = chi.URLParam(r, "slug")
		if err := store.UpdateRecipe(r.Context(), recipe); err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /api/recipes/{slug}
func DeleteRecipe(store db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		if err := store.DeleteRecipe(r.Context(), slug); err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func slugify(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else if r == ' ' || r == '-' {
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}
```

- [ ] `go build ./...` — must compile clean.
- [ ] Commit: `git commit -am "feat(handlers): admin user CRUD + recipe write handlers"`

---

## Task 8: Wire routes in main.go + Firebase init

**Files:**
- Modify: `backend/main.go`

- [ ] Replace `backend/main.go` with the following (preserving existing migration logic):

```go
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"backend/internal/db"
	"backend/internal/handlers"
	mw "backend/internal/middleware"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
)

func main() {
	_ = godotenv.Load()
	ctx := context.Background()

	if err := runMigrations(); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}

	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()
	store := db.NewPostgresStore(pool)

	// Firebase Auth client (optional in dev if GOOGLE_APPLICATION_CREDENTIALS not set)
	firebaseAuth, err := mw.InitFirebase(ctx)
	if err != nil {
		log.Fatalf("firebase init: %v", err)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{os.Getenv("ALLOWED_ORIGIN"), "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: true, // needed for cookies
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Auth (public)
	r.Post("/api/auth/login", handlers.Login(store, firebaseAuth))
	r.Post("/api/auth/logout", handlers.Logout(store))

	// Protected routes (require valid session cookie)
	r.Group(func(r chi.Router) {
		r.Use(mw.RequireSession(store))

		r.Get("/api/auth/me", handlers.Me())
		r.Get("/api/categories", handlers.ListCategories(store))
		r.Get("/api/recipes", handlers.ListRecipes(store))
		r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))

		// Admin-only (require admin role)
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireAdmin)
			r.Post("/api/recipes", handlers.CreateRecipe(store))
			r.Put("/api/recipes/{slug}", handlers.UpdateRecipe(store))
			r.Delete("/api/recipes/{slug}", handlers.DeleteRecipe(store))
			r.Get("/api/admin/users", handlers.ListUsers(store))
			r.Post("/api/admin/users", handlers.CreateUser(store))
			r.Patch("/api/admin/users/{id}", handlers.UpdateUser(store))
			r.Delete("/api/admin/users/{id}", handlers.DeleteUser(store))
		})
	})

	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("server listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func runMigrations() error {
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"), os.Getenv("DB_SSLMODE"))
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer sqlDB.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	log.Println("migrations OK")
	return nil
}
```

- [ ] `go build ./...` — must compile clean.
- [ ] `go run .` — must start and print `migrations OK` then `server listening`.
- [ ] Commit: `git commit -am "feat: wire auth + admin routes in main.go"`

---

## Task 9: create-admin command

**Files:**
- Create: `backend/cmd/create-admin/main.go`

- [ ] Create `backend/cmd/create-admin/main.go`:

```go
package main

import (
	"context"
	"log"
	"os"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load(".env")

	email := os.Getenv("ADMIN_EMAIL")
	if email == "" {
		log.Fatal("ADMIN_EMAIL env var required")
	}

	ctx := context.Background()
	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()
	store := db.NewPostgresStore(pool)

	existing, _ := store.GetUserByEmail(ctx, email)
	if existing != nil {
		_, err = store.UpdateUser(ctx, existing.ID, models.RoleAdmin, models.StatusActive)
		if err != nil {
			log.Fatalf("update user: %v", err)
		}
		log.Printf("Updated existing user %s to admin/active", email)
		return
	}

	user, err := store.CreateUser(ctx, email, models.RoleAdmin)
	if err != nil {
		log.Fatalf("create user: %v", err)
	}
	log.Printf("Created admin user: %s (id: %s)", user.Email, user.ID)
}
```

- [ ] Test it (with DB running):
```
cd backend && ADMIN_EMAIL=your@email.com go run ./cmd/create-admin/
```
Expected: `Created admin user: your@email.com (id: <uuid>)`

- [ ] Commit: `git commit -am "feat: create-admin CLI command"`

---

## Task 10: Firebase project setup + frontend SDK

This task is setup steps + code. Complete the Firebase console steps before writing code.

**Firebase Console steps (do these once):**
1. Go to console.firebase.google.com → New project → name it `kochbuch`
2. Authentication → Sign-in method → Enable **Google** and **Email/Password**
3. Project Settings → Service accounts → Generate new private key → save as `backend/serviceaccount.json` (gitignored)
4. Add `GOOGLE_APPLICATION_CREDENTIALS=serviceaccount.json` to `backend/.env`
5. Project Settings → General → Your apps → Add web app → copy the config values

**Files:**
- Create: `frontend/lib/firebase.ts`
- Modify: `frontend/package.json` (add firebase)

- [ ] Install Firebase JS SDK:
```
cd frontend && npm install firebase
```

- [ ] Create `frontend/lib/firebase.ts`:

```typescript
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)
```

- [ ] Add to `frontend/.env.local` (create if not exists — already gitignored):
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

- [ ] Commit: `git commit -am "feat(frontend): add Firebase SDK"`

---

## Task 11: Update lib/api.ts + Next.js middleware

**Files:**
- Modify: `frontend/lib/api.ts`
- Create: `frontend/middleware.ts`

- [ ] Replace `frontend/lib/api.ts`:

```typescript
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// ─── Types ────────────────────────────────────────────

export interface Category {
  slug: string; name: string; description: string; accent: string
}
export interface Ingredient {
  amount: number; unit: string; display: string; name: string
}
export interface RecipeListItem {
  slug: string; title: string; category_slug: string
  time_minutes: number; servings: string
  image_url: string; image_blurhash: string
}
export interface Recipe extends RecipeListItem {
  ingredients: Ingredient[]; steps: string[]
  notes: string; created_at: string; updated_at: string
}
export interface RecipeFilter { category?: string; q?: string }
export interface User {
  id: string; email: string; role: 'admin' | 'user'
  status: 'active' | 'deactivated'
  created_at: string; last_login?: string
}

// ─── Server-side fetch (forwards session cookie) ──────

async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      ...(session ? { Cookie: `session=${session.value}` } : {}),
    },
    cache: 'no-store',
  })
  if (res.status === 401 || res.status === 403) redirect('/login')
  return res
}

// ─── Public API (server components) ──────────────────

export async function getCategories(): Promise<Category[]> {
  const res = await serverFetch('/api/categories')
  if (!res.ok) throw new Error(`getCategories: ${res.status}`)
  return res.json()
}

export async function getRecipes(filter: RecipeFilter = {}): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)
  const qs = params.toString()
  const res = await serverFetch(`/api/recipes${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`getRecipes: ${res.status}`)
  return res.json()
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  const res = await serverFetch(`/api/recipes/${slug}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`getRecipe: ${res.status}`)
  return res.json()
}

export async function getMe(): Promise<User | null> {
  try {
    const res = await serverFetch('/api/auth/me')
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getAdminUsers(): Promise<User[]> {
  const res = await serverFetch('/api/admin/users')
  if (!res.ok) throw new Error(`getAdminUsers: ${res.status}`)
  return res.json()
}

// ─── Client-side fetch (browser sends cookie automatically) ──

export async function clientLogin(idToken: string): Promise<User> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id_token: idToken }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function clientLogout(): Promise<void> {
  await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' })
}

export async function clientCreateUser(email: string): Promise<User> {
  const res = await fetch(`${API}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function clientUpdateUser(id: string, patch: { role?: string; status?: string }): Promise<User> {
  const res = await fetch(`${API}/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function clientDeleteUser(id: string): Promise<void> {
  await fetch(`${API}/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' })
}

export async function clientSaveRecipe(recipe: Partial<Recipe>, isNew: boolean): Promise<void> {
  const url = isNew ? `${API}/api/recipes` : `${API}/api/recipes/${recipe.slug}`
  const res = await fetch(url, {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(recipe),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function clientDeleteRecipe(slug: string): Promise<void> {
  await fetch(`${API}/api/recipes/${slug}`, { method: 'DELETE', credentials: 'include' })
}
```

- [ ] Create `frontend/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = request.cookies.get('session')

  // Allow login page always
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    if (session) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }

  // Require session for everything else
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
```

- [ ] Run `npx tsc --noEmit` from `frontend/` — must pass.
- [ ] Commit: `git commit -am "feat(frontend): auth-aware API client + route protection middleware"`

---

## Task 12: Login page

**Files:**
- Create: `frontend/app/login/page.tsx`

- [ ] Create `frontend/app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { clientLogin } from '@/lib/api'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const afterFirebase = async (idToken: string) => {
    const user = await clientLogin(idToken)
    router.push(user.role === 'admin' ? '/admin' : '/')
    router.refresh()
  }

  const handleGoogle = async () => {
    setLoading(true); setError('')
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      await afterFirebase(await result.user.getIdToken())
    } catch (e: any) {
      setError(e.message?.includes('not authorized') ? 'Kein Zugang — wende dich an den Admin.' : 'Google-Login fehlgeschlagen.')
      setLoading(false)
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      let result
      if (mode === 'register') {
        result = await createUserWithEmailAndPassword(auth, email, password)
      } else {
        result = await signInWithEmailAndPassword(auth, email, password)
      }
      await afterFirebase(await result.user.getIdToken())
    } catch (e: any) {
      if (e.message?.includes('not authorized') || e.message?.includes('403')) {
        setError('Kein Zugang — wende dich an den Admin.')
      } else if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') {
        setError('E-Mail oder Passwort falsch.')
      } else if (e.code === 'auth/email-already-in-use') {
        setError('E-Mail bereits registriert — bitte einloggen.')
      } else {
        setError('Fehler: ' + (e.message ?? 'Unbekannter Fehler'))
      }
      setLoading(false)
    }
  }

  const accent = '#C2410C'

  return (
    <div style={{ minHeight: '100vh', background: '#FAF6EF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#7A6B5A', marginBottom: 6 }}>Mein</p>
          <h1 style={{ fontSize: 40, fontFamily: "'DM Serif Display', Georgia, serif", color: '#2A1F14', letterSpacing: -1, lineHeight: 1, margin: 0 }}>Kochbuch</h1>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 4px 24px rgba(80,50,20,0.10)' }}>
          {/* Google */}
          <button onClick={handleGoogle} disabled={loading} style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            border: '1px solid rgba(120,90,60,0.2)', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 15, fontWeight: 600, color: '#2A1F14', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', marginBottom: 18,
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Mit Google anmelden
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(120,90,60,0.15)' }} />
            <span style={{ fontSize: 12, color: '#7A6B5A' }}>oder</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(120,90,60,0.15)' }} />
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: '#FAF6EF', borderRadius: 10, padding: 3, marginBottom: 18 }}>
            {(['login', 'register'] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#2A1F14' : '#7A6B5A',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: mode === m ? '0 1px 4px rgba(80,50,20,0.1)' : 'none',
              }}>{m === 'login' ? 'Einloggen' : 'Registrieren'}</button>
            ))}
          </div>

          <form onSubmit={handleEmail}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="E-Mail" required style={fieldStyle} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Passwort" required style={{ ...fieldStyle, marginTop: 10 }} />
            {error && (
              <p style={{ fontSize: 13, color: '#B91C1C', margin: '10px 0 0', lineHeight: 1.4 }}>{error}</p>
            )}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
              background: loading ? '#e0d8cf' : accent, color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', marginTop: 16,
            }}>
              {loading ? 'Bitte warten…' : mode === 'login' ? 'Einloggen' : 'Konto erstellen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid rgba(120,90,60,0.2)', background: '#FAF6EF',
  fontSize: 15, color: '#2A1F14', fontFamily: 'inherit', boxSizing: 'border-box',
  outline: 'none',
}
```

- [ ] `npx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -am "feat(frontend): login page with Google + email/password"`

---

## Task 13: Admin layout + navigation

**Files:**
- Modify: `frontend/app/admin/layout.tsx`

- [ ] Replace `frontend/app/admin/layout.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMe } from '@/lib/api'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getMe()
  if (!user || user.role !== 'admin') redirect('/')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FAF6EF', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, flexShrink: 0, background: '#fff',
        borderRight: '1px solid rgba(120,90,60,0.16)',
        padding: '28px 18px', display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ marginBottom: 28, padding: '0 6px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: '#7A6B5A', marginBottom: 4 }}>Kochbuch</p>
          <p style={{ fontSize: 22, fontFamily: "'DM Serif Display', Georgia, serif", color: '#2A1F14', letterSpacing: -0.3 }}>Admin</p>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <NavLink href="/admin" label="Rezepte" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z"/></svg>
          } />
          <NavLink href="/admin/users" label="Benutzer" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          } />
        </nav>
        <div style={{ padding: '0 6px', borderTop: '1px solid rgba(120,90,60,0.12)', paddingTop: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#7A6B5A', textDecoration: 'none', fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Zur App
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '28px 36px 60px', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px', borderRadius: 9, textDecoration: 'none',
      color: '#2A1F14', fontSize: 14, fontWeight: 500,
    }}>
      {icon}
      {label}
    </Link>
  )
}
```

- [ ] `npx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -am "feat(admin): layout with sidebar nav + admin role guard"`

---

## Task 14: Admin recipe list page

**Files:**
- Create: `frontend/components/admin/recipe-list.tsx`
- Modify: `frontend/app/admin/page.tsx`

- [ ] Create `frontend/components/admin/recipe-list.tsx` — a client component matching the design's RecipesList:

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { RecipeListItem, Category } from '@/lib/api'
import { clientDeleteRecipe } from '@/lib/api'

interface Props {
  recipes: RecipeListItem[]
  categories: Category[]
}

export function AdminRecipeList({ recipes: initial, categories }: Props) {
  const router = useRouter()
  const [recipes, setRecipes] = useState(initial)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')
  const [sort, setSort] = useState('name')
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null)

  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.slug, c])), [categories])

  const filtered = useMemo(() => {
    let r = [...recipes]
    if (cat !== 'all') r = r.filter(x => x.category_slug === cat)
    if (query.trim()) {
      const q = query.toLowerCase()
      r = r.filter(x => x.title.toLowerCase().includes(q))
    }
    if (sort === 'name') r.sort((a, b) => a.title.localeCompare(b.title))
    else if (sort === 'time') r.sort((a, b) => a.time_minutes - b.time_minutes)
    return r
  }, [recipes, query, cat, sort])

  const handleDelete = async (slug: string) => {
    await clientDeleteRecipe(slug)
    setRecipes(r => r.filter(x => x.slug !== slug))
    setConfirmSlug(null)
    router.refresh()
  }

  const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', surface: '#fff', danger: '#B91C1C' }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 32, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, lineHeight: 1.05, letterSpacing: -0.5, margin: 0 }}>Rezepte</h1>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{filtered.length} von {recipes.length}</p>
        </div>
        <Link href="/admin/neu" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          borderRadius: 10, background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600,
          textDecoration: 'none', boxShadow: '0 1px 3px rgba(194,65,12,0.3)',
        }}>+ Neues Rezept</Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rezept suchen…"
          style={{ flex: '1 1 240px', padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, fontSize: 14, fontFamily: 'inherit', color: T.text }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={selStyle}>
          <option value="all">Alle Kategorien</option>
          {categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={selStyle}>
          <option value="name">Name A–Z</option>
          <option value="time">Zeit (kurz → lang)</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px 2fr 1fr 80px 110px', padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1.2, textTransform: 'uppercase', background: '#FBF7F1' }}>
          <div /><div>Name</div><div>Kategorie</div><div>Zeit</div><div style={{ textAlign: 'right' }}>Aktionen</div>
        </div>
        {filtered.length === 0 && <p style={{ padding: 40, textAlign: 'center', color: T.muted }}>Keine Rezepte gefunden.</p>}
        {filtered.map((r, i) => {
          const c = catMap[r.category_slug]
          return (
            <div key={r.slug} style={{ display: 'grid', gridTemplateColumns: '56px 2fr 1fr 80px 110px', alignItems: 'center', padding: '12px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: r.image_url ? `url(${r.image_url}) center/cover` : '#eee' }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: T.text, fontFamily: "'DM Serif Display', Georgia, serif", margin: 0 }}>{r.title}</p>
              {c && <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, background: `${c.accent}20`, color: c.accent, fontSize: 11, fontWeight: 600 }}>{c.name}</span>}
              <p style={{ fontSize: 13, color: T.text, margin: 0 }}>{r.time_minutes} min</p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Link href={`/admin/${r.slug}`} style={iconBtnStyle(T.text)}>✎</Link>
                <button onClick={() => setConfirmSlug(r.slug)} style={iconBtnStyle(T.danger)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirm delete modal */}
      {confirmSlug && (
        <div onClick={() => setConfirmSlug(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(40,25,10,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h2 style={{ fontSize: 20, fontFamily: "'DM Serif Display', Georgia, serif", margin: '0 0 10px' }}>Rezept löschen?</h2>
            <p style={{ fontSize: 14, color: T.muted, margin: '0 0 20px' }}>„{recipes.find(r => r.slug === confirmSlug)?.title}" wird unwiderruflich entfernt.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmSlug(null)} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
              <button onClick={() => handleDelete(confirmSlug)} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.danger, color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Löschen</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const selStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: 'rgba(120,90,60,0.16)', background: '#fff', fontSize: 14, fontFamily: 'inherit', color: '#2A1F14', cursor: 'pointer' }
const iconBtnStyle = (color: string): React.CSSProperties => ({ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', color, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textDecoration: 'none', fontFamily: 'inherit' })
```

- [ ] Replace `frontend/app/admin/page.tsx`:

```tsx
import { getRecipes, getCategories } from '@/lib/api'
import { AdminRecipeList } from '@/components/admin/recipe-list'

export default async function AdminPage() {
  const [recipes, categories] = await Promise.all([getRecipes(), getCategories()])
  return <AdminRecipeList recipes={recipes} categories={categories} />
}
```

- [ ] `npx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -am "feat(admin): recipe list with search/filter/sort/delete"`

---

## Task 15: Admin recipe form (full redesign)

**Files:**
- Modify: `frontend/app/admin/recipe-form.tsx`
- Modify: `frontend/app/admin/neu/page.tsx`
- Modify: `frontend/app/admin/[slug]/page.tsx`

- [ ] Replace `frontend/app/admin/recipe-form.tsx` with a full client form matching the design:

```tsx
'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Recipe, Category } from '@/lib/api'
import { clientSaveRecipe } from '@/lib/api'

interface Props {
  categories: Category[]
  initial?: Partial<Recipe>
  mode: 'create' | 'edit'
}

const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', surface: '#fff', danger: '#B91C1C', bg: '#FAF6EF' }

export function RecipeForm({ categories, initial, mode }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [error, setError] = useState('')

  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [categorySlug, setCategorySlug] = useState(initial?.category_slug ?? categories[0]?.slug ?? '')
  const [time, setTime] = useState(String(initial?.time_minutes ?? 30))
  const [servings, setServings] = useState(initial?.servings ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '')
  const [steps, setSteps] = useState<string[]>(initial?.steps?.length ? initial.steps : [''])
  const [ingredients, setIngredients] = useState(
    initial?.ingredients?.length
      ? initial.ingredients.map(i => ({ display: i.display || `${i.amount} ${i.unit}`.trim(), name: i.name }))
      : [{ display: '', name: '' }]
  )

  const handleImageFile = (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => setImageUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files?.[0]) { handleImageFile(e.dataTransfer.files[0]); return }
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url && /^https?:\/\//.test(url)) setImageUrl(url)
  }

  const importJson = () => {
    setJsonError('')
    try {
      const obj = JSON.parse(jsonText)
      if (obj.title) setTitle(obj.title)
      if (obj.slug) setSlug(obj.slug)
      if (obj.category_slug) setCategorySlug(obj.category_slug)
      if (obj.time_minutes) setTime(String(obj.time_minutes))
      if (obj.servings) setServings(String(obj.servings))
      if (obj.notes) setNotes(obj.notes)
      if (obj.image_url) setImageUrl(obj.image_url)
      if (Array.isArray(obj.steps) && obj.steps.length) setSteps(obj.steps)
      if (Array.isArray(obj.ingredients) && obj.ingredients.length) {
        setIngredients(obj.ingredients.map((i: any) => ({ display: i.display || `${i.amount ?? ''} ${i.unit ?? ''}`.trim(), name: i.name ?? '' })))
      }
      setShowJson(false); setJsonText('')
    } catch (err: any) {
      setJsonError('JSON ungültig: ' + err.message)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const recipe: Partial<Recipe> = {
        slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        title, category_slug: categorySlug, time_minutes: parseInt(time) || 0,
        servings, notes, image_url: imageUrl,
        steps: steps.filter(Boolean),
        ingredients: ingredients.filter(i => i.name).map(i => ({ display: i.display, name: i.name, amount: 0, unit: '' })),
      }
      await clientSaveRecipe(recipe, mode === 'create')
      router.push('/admin')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => router.back()} style={iconBtn}>←</button>
        <h1 style={{ flex: 1, fontSize: 28, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, letterSpacing: -0.4, margin: 0 }}>
          {mode === 'create' ? 'Neues Rezept' : 'Rezept bearbeiten'}
        </h1>
        <button type="button" onClick={() => setShowJson(s => !s)} style={{ ...outlineBtn, color: showJson ? T.accent : T.text, borderColor: showJson ? T.accent : T.border }}>JSON-Import</button>
        <button type="button" onClick={() => router.back()} style={outlineBtn}>Abbrechen</button>
        <button type="submit" disabled={saving} style={{ ...outlineBtn, background: T.accent, color: '#fff', border: 'none', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: T.danger, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* JSON Import panel */}
      {showJson && (
        <div style={cardStyle}>
          <p style={labelStyle}>JSON einfügen — Felder werden überschrieben</p>
          <textarea value={jsonText} onChange={e => { setJsonText(e.target.value); setJsonError('') }} rows={4} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
          {jsonError && <p style={{ color: T.danger, fontSize: 12, margin: '6px 0 0' }}>{jsonError}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" onClick={importJson} disabled={!jsonText.trim()} style={{ ...outlineBtn, background: T.accent, color: '#fff', border: 'none' }}>In Formular laden</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Image */}
        <section style={cardStyle}>
          <p style={sectionLabel}>Bild</p>
          <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{ minHeight: 200, borderRadius: 12, border: `2px dashed ${dragOver ? T.accent : T.border}`, background: dragOver ? '#FFF3EE' : T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
            {imageUrl && /^(https?:\/\/|data:)/.test(imageUrl)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ textAlign: 'center', color: T.muted, padding: 24 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>↑</div>
                  <p style={{ fontWeight: 600, color: T.text, margin: '0 0 4px' }}>Bild hierher ziehen oder klicken</p>
                  <p style={{ fontSize: 12, margin: 0 }}>Datei, Bild-Link oder URL</p>
                </div>
            }
            {imageUrl && <button type="button" onClick={e => { e.stopPropagation(); setImageUrl('') }} style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.9)', cursor: 'pointer', color: T.danger }}>✕</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleImageFile(e.target.files?.[0] ?? null)} />
          </div>
          <div style={{ marginTop: 10 }}>
            <p style={labelStyle}>Oder Bild-URL</p>
            <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
          </div>
        </section>

        {/* Basics */}
        <section style={cardStyle}>
          <p style={sectionLabel}>Basisdaten</p>
          <div style={{ marginBottom: 12 }}>
            <p style={labelStyle}>Titel *</p>
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Rezepttitel" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <p style={labelStyle}>Slug (URL-ID)</p>
            <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="wird automatisch generiert" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <p style={labelStyle}>Kategorie</p>
              <select value={categorySlug} onChange={e => setCategorySlug(e.target.value)} style={inputStyle}>
                {categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <p style={labelStyle}>Zeit (min)</p>
              <input type="number" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <p style={labelStyle}>Portionen</p>
              <input value={servings} onChange={e => setServings(e.target.value)} placeholder="4 Personen" style={inputStyle} />
            </div>
          </div>
        </section>

        {/* Ingredients */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={sectionLabel}>Zutaten</p>
            <button type="button" onClick={() => setIngredients(p => [...p, { display: '', name: '' }])} style={addBtnStyle}>+ Zutat</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 32px', gap: 8 }}>
                <input value={ing.display} onChange={e => setIngredients(p => p.map((x, j) => j === i ? { ...x, display: e.target.value } : x))} placeholder="500 g" style={inputStyle} />
                <input value={ing.name} onChange={e => setIngredients(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Mehl" style={inputStyle} />
                {ingredients.length > 1 && <button type="button" onClick={() => setIngredients(p => p.filter((_, j) => j !== i))} style={{ ...iconBtn, color: T.danger }}>✕</button>}
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={sectionLabel}>Zubereitung</p>
            <button type="button" onClick={() => setSteps(p => [...p, ''])} style={addBtnStyle}>+ Schritt</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 32px', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${T.accent}20`, color: T.accent, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>{i + 1}</div>
                <textarea value={s} onChange={e => setSteps(p => p.map((x, j) => j === i ? e.target.value : x))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                {steps.length > 1 && <button type="button" onClick={() => setSteps(p => p.filter((_, j) => j !== i))} style={{ ...iconBtn, color: T.danger, marginTop: 4 }}>✕</button>}
              </div>
            ))}
          </div>
        </section>

        {/* Notes */}
        <section style={cardStyle}>
          <p style={sectionLabel}>Tipp (optional)</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Hilfreicher Hinweis…" />
        </section>
      </div>
    </form>
  )
}

const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 18, border: 'rgba(120,90,60,0.16)', boxShadow: '0 1px 2px rgba(80,50,20,0.04), 0 4px 16px rgba(80,50,20,0.06)' }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#7A6B5A', margin: '0 0 12px' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#7A6B5A', margin: '0 0 5px', letterSpacing: 0.3 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(120,90,60,0.16)', background: '#FAF6EF', fontSize: 14, color: '#2A1F14', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }
const outlineBtn: React.CSSProperties = { padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#2A1F14' }
const iconBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#2A1F14', fontFamily: 'inherit' }
const addBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', color: '#C2410C', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
```

- [ ] Update `frontend/app/admin/neu/page.tsx`:

```tsx
import { getCategories } from '@/lib/api'
import { RecipeForm } from '@/app/admin/recipe-form'

export default async function NewRecipePage() {
  const categories = await getCategories()
  return <RecipeForm categories={categories} mode="create" />
}
```

- [ ] Update `frontend/app/admin/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getCategories, getRecipe } from '@/lib/api'
import { RecipeForm } from '@/app/admin/recipe-form'

export default async function EditRecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [categories, recipe] = await Promise.all([getCategories(), getRecipe(slug)])
  if (!recipe) return notFound()
  return <RecipeForm categories={categories} initial={recipe} mode="edit" />
}
```

- [ ] `npx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -am "feat(admin): full recipe editor with image drag+drop, JSON import"`

---

## Task 16: Admin users page

**Files:**
- Create: `frontend/app/admin/users/page.tsx`
- Create: `frontend/components/admin/user-list.tsx`

- [ ] Create `frontend/components/admin/user-list.tsx`:

```tsx
'use client'

import { useState, useMemo } from 'react'
import type { User } from '@/lib/api'
import { clientCreateUser, clientUpdateUser, clientDeleteUser } from '@/lib/api'

export function AdminUserList({ users: initial }: { users: User[] }) {
  const [users, setUsers] = useState(initial)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'deactivated'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [addError, setAddError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', surface: '#fff', danger: '#B91C1C', success: '#15803D', successBg: '#DCFCE7', warnBg: '#FEF3C7', warn: '#92400E' }

  const filtered = useMemo(() => {
    let r = users
    if (filter !== 'all') r = r.filter(u => u.status === filter)
    if (query.trim()) r = r.filter(u => u.email.toLowerCase().includes(query.toLowerCase()))
    return r
  }, [users, query, filter])

  const handleAdd = async () => {
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setAddError('Ungültige E-Mail'); return
    }
    try {
      const user = await clientCreateUser(newEmail.trim())
      setUsers(p => [user, ...p])
      setShowAdd(false); setNewEmail(''); setAddError('')
    } catch (e: any) { setAddError(e.message) }
  }

  const toggleStatus = async (u: User) => {
    const updated = await clientUpdateUser(u.id, { role: u.role, status: u.status === 'active' ? 'deactivated' : 'active' })
    setUsers(p => p.map(x => x.id === u.id ? updated : x))
  }

  const handleDelete = async (id: string) => {
    await clientDeleteUser(id)
    setUsers(p => p.filter(x => x.id !== id))
    setConfirmId(null)
  }

  const counts = { all: users.length, active: users.filter(u => u.status === 'active').length, deactivated: users.filter(u => u.status === 'deactivated').length }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 32, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, margin: 0 }}>Benutzer</h1>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{counts.active} aktiv · {counts.deactivated} deaktiviert</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Benutzer hinzufügen
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="E-Mail suchen…" style={{ flex: '1 1 240px', padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, fontSize: 14, fontFamily: 'inherit', color: T.text }} />
        <div style={{ display: 'flex', padding: 3, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, gap: 2 }}>
          {(['all', 'active', 'deactivated'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: filter === s ? T.accent : 'transparent', color: filter === s ? '#fff' : T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {s === 'all' ? `Alle (${counts.all})` : s === 'active' ? `Aktiv (${counts.active})` : `Deaktiviert (${counts.deactivated})`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1.2, textTransform: 'uppercase', background: '#FBF7F1' }}>
          <div>E-Mail</div><div>Status</div><div>Rolle</div><div>Erstellt</div><div />
        </div>
        {filtered.length === 0 && <p style={{ padding: 40, textAlign: 'center', color: T.muted }}>Keine Benutzer.</p>}
        {filtered.map((u, i) => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', alignItems: 'center', padding: '14px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}, #9A340A)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{u.email[0].toUpperCase()}</div>
              <span style={{ fontSize: 14, color: T.text }}>{u.email}</span>
            </div>
            <button onClick={() => toggleStatus(u)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, border: 'none', background: u.status === 'active' ? T.successBg : T.warnBg, color: u.status === 'active' ? T.success : T.warn, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.status === 'active' ? T.success : T.warn }} />
              {u.status === 'active' ? 'aktiv' : 'deaktiviert'}
            </button>
            <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>{u.role}</span>
            <span style={{ fontSize: 12, color: T.muted }}>{new Date(u.created_at).toLocaleDateString('de-DE')}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmId(u.id)} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add user modal */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(40,25,10,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h2 style={{ fontSize: 20, fontFamily: "'DM Serif Display', Georgia, serif", margin: '0 0 14px' }}>Neuer Benutzer</h2>
            <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Trage die E-Mail ein. Der Benutzer kann sich danach mit dieser Adresse anmelden.</p>
            <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setAddError('') }} onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus placeholder="benutzer@example.com" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: '#FAF6EF', fontSize: 15, fontFamily: 'inherit', color: T.text, boxSizing: 'border-box', marginBottom: addError ? 6 : 0 }} />
            {addError && <p style={{ color: T.danger, fontSize: 12, margin: '0 0 10px' }}>{addError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
              <button onClick={handleAdd} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Hinzufügen</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmId && (
        <div onClick={() => setConfirmId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(40,25,10,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h2 style={{ fontSize: 20, fontFamily: "'DM Serif Display', Georgia, serif", margin: '0 0 10px' }}>Benutzer löschen?</h2>
            <p style={{ fontSize: 14, color: T.muted, margin: '0 0 20px' }}>„{users.find(u => u.id === confirmId)?.email}" wird unwiderruflich entfernt.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmId(null)} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
              <button onClick={() => handleDelete(confirmId)} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.danger, color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Löschen</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] Create `frontend/app/admin/users/page.tsx`:

```tsx
import { getAdminUsers } from '@/lib/api'
import { AdminUserList } from '@/components/admin/user-list'

export default async function UsersPage() {
  const users = await getAdminUsers()
  return <AdminUserList users={users} />
}
```

- [ ] `npx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -am "feat(admin): users management page"`

---

## Task 17: Loading skeletons

**Files:**
- Create: `frontend/components/skeleton.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/rezepte/browse-client.tsx`

- [ ] Create `frontend/components/skeleton.tsx`:

```tsx
const shimmer = `
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`

function Skel({ w = '100%', h = 14, r = 6, style }: { w?: string | number; h?: number; r?: number; style?: React.CSSProperties }) {
  return (
    <>
      <style>{shimmer}</style>
      <div style={{
        width: w, height: h, borderRadius: r,
        background: 'linear-gradient(90deg, rgba(120,90,60,0.08) 0%, rgba(120,90,60,0.16) 50%, rgba(120,90,60,0.08) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s ease-in-out infinite',
        ...style,
      }} />
    </>
  )
}

export function HomeSkeleton() {
  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ padding: '70px 20px 24px' }}>
        <Skel w={90} h={12} style={{ marginBottom: 12 }} />
        <Skel w="80%" h={32} r={8} style={{ marginBottom: 8 }} />
        <Skel w="55%" h={32} r={8} />
      </div>
      <div style={{ padding: '0 20px', marginBottom: 32 }}>
        <Skel h={420} r={24} />
      </div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ padding: '0 20px', marginBottom: 14 }}><Skel w={160} h={22} r={6} /></div>
        <div style={{ display: 'flex', gap: 14, padding: '0 20px', overflow: 'hidden' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ flexShrink: 0, width: 180 }}>
              <Skel w={180} h={180} r={16} style={{ marginBottom: 10 }} />
              <Skel w="80%" h={14} style={{ marginBottom: 6 }} />
              <Skel w="50%" h={11} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 20px' }}>
        <Skel w={140} h={22} r={6} style={{ marginBottom: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[0,1,2,3].map(i => <Skel key={i} h={92} r={18} />)}
        </div>
      </div>
    </div>
  )
}

export function BrowseSkeleton() {
  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ padding: '70px 20px 4px' }}>
        <Skel w={140} h={32} r={8} style={{ marginBottom: 8 }} />
        <Skel w={80} h={13} />
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '16px 20px', overflow: 'hidden' }}>
        {[60,100,130,90,110].map((w,i) => <Skel key={i} w={w} h={32} r={999} />)}
      </div>
      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {[0,1,2,3,4,5].map(i => (
          <div key={i}>
            <Skel h={140} r={18} style={{ marginBottom: 10 }} />
            <Skel w="85%" h={14} style={{ marginBottom: 6 }} />
            <Skel w="55%" h={11} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div style={{ paddingBottom: 60 }}>
      <Skel h={360} r={0} />
      <div style={{ padding: '24px 20px' }}>
        <Skel w={70} h={11} style={{ marginBottom: 10 }} />
        <Skel w="85%" h={28} r={8} style={{ marginBottom: 8 }} />
        <Skel w="60%" h={28} r={8} style={{ marginBottom: 22 }} />
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <Skel w="55%" h={14} /><Skel w={60} h={14} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] In `frontend/app/page.tsx`, wrap the page with `<Suspense fallback={<HomeSkeleton />}>`:

```tsx
import { Suspense } from 'react'
import { HomeSkeleton } from '@/components/skeleton'

// Wrap the async content:
export default function EntdeckenPage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <EntdeckenContent />
    </Suspense>
  )
}

async function EntdeckenContent() {
  // ... existing async logic
}
```

- [ ] Apply the same `<Suspense fallback={<BrowseSkeleton />}>` wrapper pattern in `frontend/app/rezepte/page.tsx`.
- [ ] `npx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -am "feat(ui): loading skeletons for home, browse, and detail"`

---

## Task 18: "Last recipe" card on home + magazine step styling

**Files:**
- Modify: `frontend/app/page.tsx` (last-recipe from localStorage)
- Modify: `frontend/components/step-list.tsx` (magazine-style large italic numbers)

- [ ] In `frontend/app/page.tsx`, persist last-viewed recipe slug to `localStorage` via a tiny client wrapper. Add a `LastRecipeCard` client component:

```tsx
'use client'
import { useEffect } from 'react'
// Persist the slug of the first recipe in the list so the home page can show "continue"
export function PersistLastRecipe({ slug }: { slug: string }) {
  useEffect(() => {
    try { localStorage.setItem('last_recipe', slug) } catch {}
  }, [slug])
  return null
}
```

Use it in `EntdeckenContent` after fetching recipes:
```tsx
{featured && <PersistLastRecipe slug={featured.slug} />}
```

And add a "Weitermachen" card that reads `localStorage.getItem('last_recipe')` on mount and links to it.

- [ ] In `frontend/components/step-list.tsx`, update the step number from a circle badge to a large italic serif number (magazine style). Replace the number `<span>` with:

```tsx
<span style={{
  fontFamily: 'var(--font-serif)',
  fontSize: 36,
  fontStyle: 'italic',
  fontWeight: 400,
  color: 'var(--accent)',
  opacity: 0.35,
  lineHeight: 1,
  minWidth: 32,
  flexShrink: 0,
}}>
  {index + 1}
</span>
```

- [ ] `npx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -am "feat(ui): last-recipe card on home + magazine step numbers"`

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by task |
|---|---|
| Firebase Google OAuth | Task 10, 12 |
| Firebase email/password | Task 10, 12 |
| Admin approves users (pre-add email) | Task 7, 16 |
| Single session per regular user | Task 6 (DeleteSessionsByUserID before CreateSession) |
| Admin unlimited sessions | Task 6 (skip deletion if role=admin) |
| Admin-only /admin routes | Task 5 (RequireAdmin middleware), Task 8 (routes), Task 13 (admin layout) |
| Admin-only write access | Task 8 (recipe write routes under RequireAdmin) |
| All routes login-gated | Task 8 (all routes under RequireSession), Task 11 (Next.js middleware) |
| create-admin CLI | Task 9 |
| Admin recipe list (search/filter/sort/delete) | Task 14 |
| Admin recipe editor (image drag+drop, JSON import) | Task 15 |
| Admin user management (add/toggle/delete) | Task 16 |
| Loading skeletons | Task 17 |
| Last recipe card | Task 18 |
| Magazine step numbers | Task 18 |

**Placeholder scan:** None found — all steps have concrete code.

**Type consistency check:** `models.Role`, `models.Status`, `models.User`, `models.Session` defined in Task 2 and used consistently in Tasks 3–9. `clientSaveRecipe` / `clientDeleteRecipe` / `clientCreateUser` defined in Task 11 and used in Tasks 14–16.

---
