# Kochbuch v3 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Go API server (chi + pgx) with PostgreSQL, Dockerised with Caddy, serving recipe and category data, plus a one-time seed script that uploads images to Cloudinary and imports all JSON data into Postgres.

**Architecture:** chi HTTP router with a `Store` interface injected into handlers — real `PostgresStore` in production, `MockStore` in unit tests. JSONB used for ingredients/steps. Seed script parses legacy JSON (including ingredient amounts like `"500 g"` → `{amount:500, unit:"g"}`) and uploads images to Cloudinary before inserting rows.

**Tech Stack:** Go 1.26, chi v5, pgx v5, testify, godotenv, Cloudinary Go SDK v2, Docker Compose, Caddy 2, PostgreSQL 16.

---

## File map

```
backend/
  go.mod                                    modify
  migrations/001_init.sql                   create
  internal/models/category.go               create
  internal/models/recipe.go                 create
  internal/db/store.go                      create
  internal/db/mock_store.go                 create
  internal/db/postgres.go                   create
  internal/db/categories.go                 create
  internal/db/recipes.go                    create
  internal/handlers/categories.go           create
  internal/handlers/categories_test.go      create
  internal/handlers/recipes.go              create
  internal/handlers/recipes_test.go         create
  main.go                                   rewrite
  cmd/seed/time.go                          create
  cmd/seed/time_test.go                     create
  cmd/seed/ingredient.go                    create
  cmd/seed/main.go                          create
  Dockerfile                                create
  .env.example                              create
docker-compose.yml                          create (project root)
Caddyfile                                   create (project root)
```

---

## Task 1: Add Go dependencies

**Files:**
- Modify: `backend/go.mod`

- [ ] **Step 1: Add dependencies**

Run from the `backend/` directory:
```bash
go get github.com/go-chi/chi/v5@latest
go get github.com/go-chi/cors@latest
go get github.com/jackc/pgx/v5@latest
go get github.com/joho/godotenv@latest
go get github.com/stretchr/testify@latest
go get github.com/cloudinary/cloudinary-go/v2@latest
go mod tidy
```

- [ ] **Step 2: Verify go.mod has all five deps**

```bash
grep -E "chi|pgx|godotenv|testify|cloudinary" go.mod
```
Expected output shows all five packages.

- [ ] **Step 3: Commit**

```bash
git add backend/go.mod backend/go.sum
git commit -m "feat(backend): add chi, pgx, testify, godotenv, cloudinary deps"
```

---

## Task 2: Database migration SQL

**Files:**
- Create: `backend/migrations/001_init.sql`

- [ ] **Step 1: Create migration file**

`backend/migrations/001_init.sql`:
```sql
CREATE TABLE IF NOT EXISTS categories (
    slug        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    accent      TEXT NOT NULL DEFAULT '#C2410C'
);

CREATE TABLE IF NOT EXISTS recipes (
    slug           TEXT PRIMARY KEY,
    title          TEXT NOT NULL,
    category_slug  TEXT NOT NULL REFERENCES categories(slug),
    time_minutes   INTEGER NOT NULL DEFAULT 0,
    servings       TEXT NOT NULL DEFAULT '',
    ingredients    JSONB NOT NULL DEFAULT '[]',
    steps          JSONB NOT NULL DEFAULT '[]',
    notes          TEXT NOT NULL DEFAULT '',
    image_url      TEXT NOT NULL DEFAULT '',
    image_blurhash TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category_slug);
CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title);
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/
git commit -m "feat(backend): add initial DB migration SQL"
```

---

## Task 3: Models

**Files:**
- Create: `backend/internal/models/category.go`
- Create: `backend/internal/models/recipe.go`

- [ ] **Step 1: Create category model**

`backend/internal/models/category.go`:
```go
package models

type Category struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Accent      string `json:"accent"`
}
```

- [ ] **Step 2: Create recipe models**

`backend/internal/models/recipe.go`:
```go
package models

import "time"

// Ingredient is the parsed form stored in JSONB.
// Amount is numeric (0 if unparseable). Display is the original string.
type Ingredient struct {
	Amount  float64 `json:"amount"`
	Unit    string  `json:"unit"`
	Display string  `json:"display"`
	Name    string  `json:"name"`
}

// RecipeListItem is returned by GET /api/recipes (no ingredients/steps).
type RecipeListItem struct {
	Slug          string `json:"slug"`
	Title         string `json:"title"`
	CategorySlug  string `json:"category_slug"`
	TimeMinutes   int    `json:"time_minutes"`
	Servings      string `json:"servings"`
	ImageURL      string `json:"image_url"`
	ImageBlurhash string `json:"image_blurhash"`
}

// Recipe is the full record returned by GET /api/recipes/{slug}.
type Recipe struct {
	Slug          string       `json:"slug"`
	Title         string       `json:"title"`
	CategorySlug  string       `json:"category_slug"`
	TimeMinutes   int          `json:"time_minutes"`
	Servings      string       `json:"servings"`
	Ingredients   []Ingredient `json:"ingredients"`
	Steps         []string     `json:"steps"`
	Notes         string       `json:"notes"`
	ImageURL      string       `json:"image_url"`
	ImageBlurhash string       `json:"image_blurhash"`
	CreatedAt     time.Time    `json:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at"`
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd backend && go build ./internal/models/...
```
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/models/
git commit -m "feat(backend): add Category, Recipe, RecipeListItem models"
```

---

## Task 4: Store interface + MockStore

**Files:**
- Create: `backend/internal/db/store.go`
- Create: `backend/internal/db/mock_store.go`

- [ ] **Step 1: Create Store interface**

`backend/internal/db/store.go`:
```go
package db

import (
	"context"

	"backend/internal/models"
)

// RecipeFilter holds optional filter params for GetRecipes.
type RecipeFilter struct {
	Category string
	Query    string
	Limit    int
	Offset   int
}

// Store is the database interface. PostgresStore implements it for production;
// MockStore implements it for handler unit tests.
type Store interface {
	GetCategories(ctx context.Context) ([]models.Category, error)
	GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error)
	GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error)
}
```

- [ ] **Step 2: Create MockStore**

`backend/internal/db/mock_store.go`:
```go
package db

import (
	"context"

	"backend/internal/models"
)

// MockStore is used in handler unit tests. Set the fields before calling.
type MockStore struct {
	Categories []models.Category
	Recipes    []models.RecipeListItem
	Recipe     *models.Recipe
	Err        error
}

func (m *MockStore) GetCategories(_ context.Context) ([]models.Category, error) {
	return m.Categories, m.Err
}

func (m *MockStore) GetRecipes(_ context.Context, _ RecipeFilter) ([]models.RecipeListItem, error) {
	return m.Recipes, m.Err
}

func (m *MockStore) GetRecipeBySlug(_ context.Context, _ string) (*models.Recipe, error) {
	return m.Recipe, m.Err
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd backend && go build ./internal/db/...
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/db/store.go backend/internal/db/mock_store.go
git commit -m "feat(backend): add Store interface and MockStore"
```

---

## Task 5: PostgresStore — connection pool

**Files:**
- Create: `backend/internal/db/postgres.go`

- [ ] **Step 1: Create PostgresStore and connection helper**

`backend/internal/db/postgres.go`:
```go
package db

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore implements Store using a pgx connection pool.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPool opens and pings a pgxpool using DB_* environment variables.
func NewPool(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_SSLMODE"),
	)
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("db: create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("db: ping: %w", err)
	}
	return pool, nil
}

// NewPostgresStore wraps a pgxpool in a PostgresStore.
func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}
```

- [ ] **Step 2: Verify**

```bash
cd backend && go build ./internal/db/...
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/db/postgres.go
git commit -m "feat(backend): add PostgresStore and NewPool"
```

---

## Task 6: Categories DB method

**Files:**
- Create: `backend/internal/db/categories.go`

- [ ] **Step 1: Implement GetCategories**

`backend/internal/db/categories.go`:
```go
package db

import (
	"context"

	"backend/internal/models"
)

func (s *PostgresStore) GetCategories(ctx context.Context) ([]models.Category, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT slug, name, description, accent FROM categories ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []models.Category
	for rows.Next() {
		var c models.Category
		if err := rows.Scan(&c.Slug, &c.Name, &c.Description, &c.Accent); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}
```

- [ ] **Step 2: Verify**

```bash
cd backend && go build ./internal/db/...
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/db/categories.go
git commit -m "feat(backend): implement GetCategories"
```

---

## Task 7: Recipes DB methods

**Files:**
- Create: `backend/internal/db/recipes.go`

- [ ] **Step 1: Implement GetRecipes and GetRecipeBySlug**

`backend/internal/db/recipes.go`:
```go
package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error) {
	if f.Limit == 0 {
		f.Limit = 200
	}
	rows, err := s.pool.Query(ctx, `
		SELECT slug, title, category_slug, time_minutes, servings, image_url, image_blurhash
		FROM recipes
		WHERE ($1 = '' OR category_slug = $1)
		  AND ($2 = '' OR title ILIKE '%' || $2 || '%'
		                OR ingredients::text ILIKE '%' || $2 || '%')
		ORDER BY title
		LIMIT $3 OFFSET $4`,
		f.Category, f.Query, f.Limit, f.Offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipes []models.RecipeListItem
	for rows.Next() {
		var r models.RecipeListItem
		if err := rows.Scan(
			&r.Slug, &r.Title, &r.CategorySlug,
			&r.TimeMinutes, &r.Servings, &r.ImageURL, &r.ImageBlurhash,
		); err != nil {
			return nil, err
		}
		recipes = append(recipes, r)
	}
	return recipes, rows.Err()
}

func (s *PostgresStore) GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error) {
	var r models.Recipe
	var ingredientsJSON, stepsJSON []byte

	err := s.pool.QueryRow(ctx, `
		SELECT slug, title, category_slug, time_minutes, servings,
		       ingredients, steps, notes, image_url, image_blurhash,
		       created_at, updated_at
		FROM recipes WHERE slug = $1`, slug).
		Scan(
			&r.Slug, &r.Title, &r.CategorySlug,
			&r.TimeMinutes, &r.Servings,
			&ingredientsJSON, &stepsJSON,
			&r.Notes, &r.ImageURL, &r.ImageBlurhash,
			&r.CreatedAt, &r.UpdatedAt,
		)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(ingredientsJSON, &r.Ingredients); err != nil {
		return nil, fmt.Errorf("unmarshal ingredients: %w", err)
	}
	if err := json.Unmarshal(stepsJSON, &r.Steps); err != nil {
		return nil, fmt.Errorf("unmarshal steps: %w", err)
	}
	return &r, nil
}
```

- [ ] **Step 2: Verify**

```bash
cd backend && go build ./internal/db/...
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/db/recipes.go
git commit -m "feat(backend): implement GetRecipes and GetRecipeBySlug"
```

---

## Task 8: Categories handler + test

**Files:**
- Create: `backend/internal/handlers/categories.go`
- Create: `backend/internal/handlers/categories_test.go`

- [ ] **Step 1: Write the failing test first**

`backend/internal/handlers/categories_test.go`:
```go
package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/db"
	"backend/internal/handlers"
	"backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListCategories_returnsJSON(t *testing.T) {
	store := &db.MockStore{
		Categories: []models.Category{
			{Slug: "hauptgerichte", Name: "Hauptgerichte", Description: "desc", Accent: "#C2410C"},
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/categories", nil)
	w := httptest.NewRecorder()
	handlers.ListCategories(store)(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var got []models.Category
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	require.Len(t, got, 1)
	assert.Equal(t, "hauptgerichte", got[0].Slug)
}

func TestListCategories_storeError(t *testing.T) {
	store := &db.MockStore{Err: fmt.Errorf("db down")}

	req := httptest.NewRequest(http.MethodGet, "/api/categories", nil)
	w := httptest.NewRecorder()
	handlers.ListCategories(store)(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}
```

Add `"fmt"` to imports.

- [ ] **Step 2: Run test — expect compile error (handler doesn't exist yet)**

```bash
cd backend && go test ./internal/handlers/... 2>&1 | head -5
```
Expected: `undefined: handlers.ListCategories`

- [ ] **Step 3: Implement handler**

`backend/internal/handlers/categories.go`:
```go
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
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd backend && go test ./internal/handlers/... -run TestListCategories -v
```
Expected:
```
--- PASS: TestListCategories_returnsJSON (0.00s)
--- PASS: TestListCategories_storeError (0.00s)
PASS
```

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/categories.go backend/internal/handlers/categories_test.go
git commit -m "feat(backend): ListCategories handler with tests"
```

---

## Task 9: Recipes handlers + tests

**Files:**
- Create: `backend/internal/handlers/recipes.go`
- Create: `backend/internal/handlers/recipes_test.go`

- [ ] **Step 1: Write failing tests**

`backend/internal/handlers/recipes_test.go`:
```go
package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"backend/internal/db"
	"backend/internal/handlers"
	"backend/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListRecipes_returnsAll(t *testing.T) {
	store := &db.MockStore{
		Recipes: []models.RecipeListItem{
			{Slug: "bolognese", Title: "Bolognese", CategorySlug: "hauptgerichte", TimeMinutes: 30},
		},
	}
	req := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
	w := httptest.NewRecorder()
	handlers.ListRecipes(store)(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var got []models.RecipeListItem
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	require.Len(t, got, 1)
	assert.Equal(t, "bolognese", got[0].Slug)
}

func TestListRecipes_storeError(t *testing.T) {
	store := &db.MockStore{Err: fmt.Errorf("db down")}
	req := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
	w := httptest.NewRecorder()
	handlers.ListRecipes(store)(w, req)
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestGetRecipe_found(t *testing.T) {
	store := &db.MockStore{
		Recipe: &models.Recipe{
			Slug:        "bolognese",
			Title:       "Bolognese",
			TimeMinutes: 30,
			Ingredients: []models.Ingredient{{Amount: 500, Unit: "g", Display: "500 g", Name: "Hackfleisch"}},
			Steps:       []string{"Schritt 1"},
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
	}

	r := chi.NewRouter()
	r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))
	req := httptest.NewRequest(http.MethodGet, "/api/recipes/bolognese", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var got models.Recipe
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	assert.Equal(t, "bolognese", got.Slug)
	assert.Equal(t, "Hackfleisch", got.Ingredients[0].Name)
}

func TestGetRecipe_notFound(t *testing.T) {
	store := &db.MockStore{Recipe: nil}
	r := chi.NewRouter()
	r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))
	req := httptest.NewRequest(http.MethodGet, "/api/recipes/does-not-exist", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}
```

- [ ] **Step 2: Run — expect compile error**

```bash
cd backend && go test ./internal/handlers/... 2>&1 | head -5
```
Expected: `undefined: handlers.ListRecipes`

- [ ] **Step 3: Implement handlers**

`backend/internal/handlers/recipes.go`:
```go
package handlers

import (
	"encoding/json"
	"net/http"

	"backend/internal/db"
	"github.com/go-chi/chi/v5"
)

func ListRecipes(s db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		f := db.RecipeFilter{
			Category: r.URL.Query().Get("category"),
			Query:    r.URL.Query().Get("q"),
		}
		recipes, err := s.GetRecipes(r.Context(), f)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if recipes == nil {
			recipes = []db.RecipeListItem{} // return [] not null
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(recipes)
	}
}
```

Wait — `db.RecipeListItem` doesn't exist. Fix: use `models.RecipeListItem`:

```go
package handlers

import (
	"encoding/json"
	"net/http"

	"backend/internal/db"
	"backend/internal/models"
	"github.com/go-chi/chi/v5"
)

func ListRecipes(s db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		f := db.RecipeFilter{
			Category: r.URL.Query().Get("category"),
			Query:    r.URL.Query().Get("q"),
		}
		recipes, err := s.GetRecipes(r.Context(), f)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if recipes == nil {
			recipes = []models.RecipeListItem{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(recipes)
	}
}

func GetRecipe(s db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		recipe, err := s.GetRecipeBySlug(r.Context(), slug)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if recipe == nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(recipe)
	}
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd backend && go test ./internal/handlers/... -v
```
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/
git commit -m "feat(backend): ListRecipes and GetRecipe handlers with tests"
```

---

## Task 10: main.go — wire everything

**Files:**
- Modify: `backend/main.go`

- [ ] **Step 1: Rewrite main.go**

`backend/main.go`:
```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"backend/internal/db"
	"backend/internal/handlers"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load() // load .env if present; ignore error if not

	ctx := context.Background()
	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	store := db.NewPostgresStore(pool)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{os.Getenv("ALLOWED_ORIGIN"), "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api", func(r chi.Router) {
		r.Get("/categories", handlers.ListCategories(store))
		r.Get("/recipes", handlers.ListRecipes(store))
		r.Get("/recipes/{slug}", handlers.GetRecipe(store))
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
```

- [ ] **Step 2: Verify build**

```bash
cd backend && go build .
```
Expected: no errors, produces `backend` executable.

- [ ] **Step 3: Commit**

```bash
git add backend/main.go
git commit -m "feat(backend): wire chi router with all handlers and CORS"
```

---

## Task 11: .env.example

**Files:**
- Create: `backend/.env.example`

- [ ] **Step 1: Create .env.example**

`backend/.env.example`:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=changeme
DB_NAME=kochbuch
DB_SSLMODE=disable

SERVER_ADDR=:8080
ALLOWED_ORIGIN=https://your-vercel-app.vercel.app

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

ADMIN_USER_ID=
```

Update the existing `backend/.env` to match this structure (fill in actual values).

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "docs(backend): add .env.example"
```

---

## Task 12: Dockerfile

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create multi-stage Dockerfile**

`backend/Dockerfile`:
```dockerfile
# Build stage
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server .

# Run stage
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server ./server
COPY migrations/ ./migrations/
EXPOSE 8080
CMD ["./server"]
```

Note: uses `golang:1.23-alpine` as the base image. If your local Go version is higher, update the FROM line to match.

- [ ] **Step 2: Test the build locally (optional)**

```bash
cd backend && docker build -t kochbuch-backend .
```
Expected: build succeeds, image created.

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat(backend): add multi-stage Dockerfile"
```

---

## Task 13: Docker Compose + Caddy + infrastructure files

**Files:**
- Create: `docker-compose.yml` (project root)
- Create: `Caddyfile` (project root)

- [ ] **Step 1: Create docker-compose.yml**

`docker-compose.yml` (at project root, next to `backend/` and `frontend/`):
```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: backend/.env
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./backend/migrations/001_init.sql:/docker-entrypoint-initdb.d/001_init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    restart: unless-stopped
    env_file: backend/.env
    environment:
      DB_HOST: postgres
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8080:8080"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - backend

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

Note: The migration SQL is mounted as an init script — Postgres runs it automatically on first start.

- [ ] **Step 2: Create Caddyfile**

`Caddyfile` (project root):
```
api.yourdomain.com {
    reverse_proxy backend:8080
}
```

Replace `api.yourdomain.com` with your actual subdomain before deploying.

- [ ] **Step 3: Verify Docker Compose config**

```bash
docker compose config
```
Expected: outputs merged config with no errors.

- [ ] **Step 4: Test local startup (needs Docker running)**

```bash
docker compose up --build
```
Then in another terminal:
```bash
curl http://localhost:8080/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml Caddyfile
git commit -m "feat(infra): add Docker Compose and Caddyfile"
```

---

## Task 14: Seed script — time parser

**Files:**
- Create: `backend/cmd/seed/time.go`
- Create: `backend/cmd/seed/time_test.go`

- [ ] **Step 1: Write failing tests first**

`backend/cmd/seed/time_test.go`:
```go
package main

import (
	"testing"
)

func TestParseTimeMinutes(t *testing.T) {
	cases := []struct {
		input string
		want  int
	}{
		{"30 Minuten", 30},
		{"45 Minuten", 45},
		{"1 Stunde", 60},
		{"2 Stunden", 120},
		{"1,5 Stunden", 90},
		{"1 Stunde 30 Minuten", 90},
		{"45–60 Minuten", 45},
		{"45-60 Minuten", 45},
		{"ca. 20 Minuten", 20},
		{"", 0},
		{"nach Bedarf", 0},
	}
	for _, c := range cases {
		got := parseTimeMinutes(c.input)
		if got != c.want {
			t.Errorf("parseTimeMinutes(%q) = %d, want %d", c.input, got, c.want)
		}
	}
}
```

- [ ] **Step 2: Run — expect compile error**

```bash
cd backend && go test ./cmd/seed/... 2>&1 | head -5
```
Expected: `undefined: parseTimeMinutes`

- [ ] **Step 3: Implement time parser**

`backend/cmd/seed/time.go`:
```go
package main

import (
	"regexp"
	"strconv"
	"strings"
)

var (
	rangeRe  = regexp.MustCompile(`(\d+)\s*[–\-]\s*\d+`)
	hourRe   = regexp.MustCompile(`(\d+(?:[,.]\d+)?)\s*[Ss]tunde[n]?`)
	minuteRe = regexp.MustCompile(`(\d+(?:[,.]\d+)?)\s*[Mm]inuten?`)
)

func parseTimeMinutes(s string) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}

	// Ranges like "45–60 Minuten" → take lower bound
	if m := rangeRe.FindStringSubmatch(s); m != nil {
		if v, err := strconv.Atoi(m[1]); err == nil {
			return v
		}
	}

	total := 0

	// Hours: "1 Stunde", "1,5 Stunden", "2 Stunden"
	if m := hourRe.FindStringSubmatch(s); m != nil {
		numStr := strings.ReplaceAll(m[1], ",", ".")
		if v, err := strconv.ParseFloat(numStr, 64); err == nil {
			total += int(v * 60)
		}
	}

	// Minutes: "30 Minuten", "ca. 20 Minuten"
	if m := minuteRe.FindStringSubmatch(s); m != nil {
		numStr := strings.ReplaceAll(m[1], ",", ".")
		if v, err := strconv.ParseFloat(numStr, 64); err == nil {
			total += int(v)
		}
	}

	return total
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && go test ./cmd/seed/... -run TestParseTimeMinutes -v
```
Expected: all 11 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/seed/time.go backend/cmd/seed/time_test.go
git commit -m "feat(seed): time string parser with tests"
```

---

## Task 15: Seed script — ingredient parser

**Files:**
- Create: `backend/cmd/seed/ingredient.go`

Source data has `{amount: "500 g", name: "Hackfleisch"}`. We need `{amount: 500, unit: "g", display: "500 g", name: "Hackfleisch"}` in the DB.

- [ ] **Step 1: Create ingredient parser**

`backend/cmd/seed/ingredient.go`:
```go
package main

import (
	"regexp"
	"strconv"
	"strings"

	"backend/internal/models"
)

// known units, longest-match first to avoid "g" matching inside "kg"
var knownUnits = []string{
	"EL", "TL", "kg", "ml", "cl", "dl", "Liter", "l",
	"Stück", "Stk", "Zehen", "Zehe", "Bund", "Prise",
	"Dose", "Packung", "Pkg", "Tasse", "g",
}

var rangeNumRe = regexp.MustCompile(`^(\d+(?:[,.]\d+)?)\s*[–\-]\s*\d+`)
var fracMap = map[string]float64{
	"½": 0.5, "¼": 0.25, "¾": 0.75,
	"⅓": 0.333, "⅔": 0.667,
}

func parseIngredient(amountStr, name string) models.Ingredient {
	display := strings.TrimSpace(amountStr)
	ing := models.Ingredient{Display: display, Name: name}

	for _, unit := range knownUnits {
		idx := strings.Index(display, unit)
		if idx < 0 {
			continue
		}
		numPart := strings.TrimSpace(display[:idx])
		unitPart := unit
		if amt, ok := parseFloat(numPart); ok {
			ing.Amount = amt
			ing.Unit = unitPart
			return ing
		}
	}

	// No unit found — try plain number
	if amt, ok := parseFloat(display); ok {
		ing.Amount = amt
	}
	return ing
}

func parseFloat(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}

	// Fraction characters
	for frac, val := range fracMap {
		if strings.Contains(s, frac) {
			rest := strings.TrimSpace(strings.ReplaceAll(s, frac, ""))
			if rest == "" {
				return val, true
			}
			rest = strings.ReplaceAll(rest, ",", ".")
			if n, err := strconv.ParseFloat(rest, 64); err == nil {
				return n + val, true
			}
			return val, true
		}
	}

	// Range "1–2" → take lower
	if m := rangeNumRe.FindStringSubmatch(s); m != nil {
		s = m[1]
	}

	s = strings.ReplaceAll(s, ",", ".")
	if v, err := strconv.ParseFloat(s, 64); err == nil {
		return v, true
	}
	return 0, false
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && go build ./cmd/seed/...
```

- [ ] **Step 3: Commit**

```bash
git add backend/cmd/seed/ingredient.go
git commit -m "feat(seed): ingredient amount parser"
```

---

## Task 16: Seed script — main

**Files:**
- Create: `backend/cmd/seed/main.go`

This script reads from `kochbuch-data/recipes_export_*/`, uploads images to Cloudinary, then inserts into Postgres. Run it once from the project root.

- [ ] **Step 1: Create seed main**

`backend/cmd/seed/main.go`:
```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"backend/internal/db"
	"backend/internal/models"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/joho/godotenv"
)

// sourceRecipe matches the JSON shape of the export files.
type sourceRecipe struct {
	Slug          string `json:"slug"`
	Title         string `json:"title"`
	Category      string `json:"category"`
	Time          string `json:"time"`
	Servings      string `json:"servings"`
	Notes         string `json:"notes"`
	ImageBlurhash string `json:"image_blurhash"`
	Ingredients   []struct {
		Amount string `json:"amount"`
		Name   string `json:"name"`
	} `json:"ingredients"`
	Steps  []string `json:"steps"`
	Export struct {
		Image struct {
			Path string `json:"path"`
		} `json:"image"`
	} `json:"_export"`
}

type sourceCategory struct {
	Slug         string `json:"slug"`
	CategoryName string `json:"categoryName"`
	Description  string `json:"description"`
}

// Category accent colors by slug.
var categoryAccents = map[string]string{
	"hauptgerichte":           "#C2410C",
	"grundrezepte-und-saucen": "#5F7A4F",
	"backen-und-suesses":      "#9333EA",
	"snacks":                  "#1E5C8A",
}

func main() {
	_ = godotenv.Load("backend/.env")

	ctx := context.Background()

	// Connect to DB
	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()
	store := db.NewPostgresStore(pool)

	// Init Cloudinary
	cld, err := cloudinary.NewFromParams(
		os.Getenv("CLOUDINARY_CLOUD_NAME"),
		os.Getenv("CLOUDINARY_API_KEY"),
		os.Getenv("CLOUDINARY_API_SECRET"),
	)
	if err != nil {
		log.Fatalf("cloudinary init: %v", err)
	}

	exportDir := "kochbuch-data/recipes_export_20260505_160450"

	// 1. Seed categories
	catData, err := os.ReadFile(filepath.Join(exportDir, "categories.json"))
	if err != nil {
		log.Fatalf("read categories: %v", err)
	}
	var srcCats []sourceCategory
	if err := json.Unmarshal(catData, &srcCats); err != nil {
		log.Fatalf("parse categories: %v", err)
	}
	for _, sc := range srcCats {
		accent := categoryAccents[sc.Slug]
		if accent == "" {
			accent = "#888888"
		}
		_, err := pool.Exec(ctx, `
			INSERT INTO categories (slug, name, description, accent)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (slug) DO UPDATE
			  SET name=$2, description=$3, accent=$4`,
			sc.Slug, sc.CategoryName, sc.Description, accent)
		if err != nil {
			log.Fatalf("insert category %s: %v", sc.Slug, err)
		}
		log.Printf("category OK: %s", sc.Slug)
	}

	// 2. Seed recipes
	recipeFiles, err := filepath.Glob(filepath.Join(exportDir, "recipes", "*.json"))
	if err != nil {
		log.Fatalf("glob recipes: %v", err)
	}

	for _, f := range recipeFiles {
		data, err := os.ReadFile(f)
		if err != nil {
			log.Printf("WARN: read %s: %v", f, err)
			continue
		}
		var src sourceRecipe
		if err := json.Unmarshal(data, &src); err != nil {
			log.Printf("WARN: parse %s: %v", f, err)
			continue
		}

		// Upload image to Cloudinary
		imageURL := ""
		if src.Export.Image.Path != "" {
			localPath := filepath.Join(exportDir, src.Export.Image.Path)
			result, err := cld.Upload.Upload(ctx, localPath, uploader.UploadParams{
				Folder:   "kochbuch",
				PublicID: src.Slug,
			})
			if err != nil {
				log.Printf("WARN: cloudinary upload %s: %v — skipping image", src.Slug, err)
			} else {
				imageURL = result.SecureURL
			}
		}

		// Parse ingredients
		ingredients := make([]models.Ingredient, 0, len(src.Ingredients))
		for _, si := range src.Ingredients {
			ingredients = append(ingredients, parseIngredient(si.Amount, si.Name))
		}

		// Serialize to JSONB
		ingredientsJSON, _ := json.Marshal(ingredients)
		stepsJSON, _ := json.Marshal(src.Steps)

		_, err = pool.Exec(ctx, `
			INSERT INTO recipes
			  (slug, title, category_slug, time_minutes, servings,
			   ingredients, steps, notes, image_url, image_blurhash)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (slug) DO UPDATE
			  SET title=$2, category_slug=$3, time_minutes=$4, servings=$5,
			      ingredients=$6, steps=$7, notes=$8, image_url=$9,
			      image_blurhash=$10, updated_at=now()`,
			src.Slug,
			src.Title,
			src.Category,
			parseTimeMinutes(src.Time),
			src.Servings,
			ingredientsJSON,
			stepsJSON,
			src.Notes,
			imageURL,
			src.ImageBlurhash,
		)
		if err != nil {
			log.Printf("WARN: insert %s: %v", src.Slug, err)
			continue
		}
		log.Printf("recipe OK: %s → %s", src.Slug, imageURL)
	}

	log.Println("seed complete")
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && go build ./cmd/seed/...
```
Expected: no errors.

- [ ] **Step 3: Run the seed (requires DB running + Cloudinary credentials in .env)**

From the project root:
```bash
cd backend && go run ./cmd/seed
```
Expected output:
```
category OK: hauptgerichte
category OK: grundrezepte-und-saucen
...
recipe OK: 004_chili_con_carne → https://res.cloudinary.com/...
...
seed complete
```

- [ ] **Step 4: Verify data in Postgres**

```bash
docker exec -it <postgres-container> psql -U postgres -d kochbuch -c "SELECT COUNT(*) FROM recipes;"
```
Expected: count matching the number of JSON files (~100).

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/seed/main.go
git commit -m "feat(seed): main seed script — categories + recipes + Cloudinary upload"
```

---

## Verification checklist

After all tasks are complete, run this full verification:

```bash
# All handler tests pass
cd backend && go test ./... -v

# Server builds
go build .

# Docker Compose starts cleanly
cd .. && docker compose up --build -d

# Health check
curl http://localhost:8080/health
# → {"status":"ok"}

# Categories
curl http://localhost:8080/api/categories
# → JSON array of 4 categories

# Recipes
curl http://localhost:8080/api/recipes
# → JSON array of all recipes

# Category filter
curl "http://localhost:8080/api/recipes?category=hauptgerichte"
# → filtered list

# Search
curl "http://localhost:8080/api/recipes?q=Bolognese"
# → matching recipes

# Recipe detail
curl http://localhost:8080/api/recipes/004_chili_con_carne
# → full recipe with ingredients array
```
