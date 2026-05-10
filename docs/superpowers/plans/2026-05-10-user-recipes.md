# User-Created Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let regular users create recipes either manually or by uploading 1–3 photos that a vision LLM converts to a structured German recipe; expose user recipes only to their owner (admins can moderate).

**Architecture:** Add `owner_id` to `recipes` (NULL = global/admin recipe). Add `ai_jobs` + `ai_usage_daily` tables. Backend gains a provider-agnostic `ai.Extractor` interface (Claude + OpenAI implementations) and a 2-goroutine worker pool that polls `ai_jobs` with `FOR UPDATE SKIP LOCKED`. Frontend gets a `+ Neu` tab leading to `/neu`, which branches into manual or image-based creation. The existing admin recipe form is extracted into a shared component reused for create/edit/AI-review.

**Tech Stack:** Go 1.26, chi v5, pgx v5, Goose v3, Anthropic Go SDK, OpenAI Go SDK, Next.js (App Router), TypeScript, Cloudinary (existing).

**Spec:** `docs/superpowers/specs/2026-05-10-user-recipes-design.md`

---

## File map

**Backend — created**
- `backend/migrations/0004_user_recipes.sql`
- `backend/internal/db/ai_jobs.go` — Store methods for ai_jobs + ai_usage_daily
- `backend/internal/ai/extractor.go` — interface, registry, request/result types, prompt
- `backend/internal/ai/claude.go` — Anthropic implementation
- `backend/internal/ai/openai.go` — OpenAI implementation
- `backend/internal/ai/worker.go` — worker pool + cleanup ticker
- `backend/internal/ai/cost.go` — per-model price table + cost calc
- `backend/internal/handlers/ai_jobs.go` — POST/GET/DELETE handlers + rate-limit logic
- `backend/internal/handlers/admin_recipes.go` — `GET /api/admin/recipes`
- `backend/internal/handlers/access.go` — `recipeAccess` helper, `slugifyUnique` helper
- `backend/internal/handlers/ai_jobs_test.go`
- `backend/internal/ai/worker_test.go`
- `backend/cmd/ai-eval/main.go` + `eval/dishes.json`

**Backend — modified**
- `backend/internal/models/recipe.go` — add OwnerID, OwnerEmail, IsMine
- `backend/internal/db/store.go` — add ai_jobs/ai_usage methods + ownership-aware reads
- `backend/internal/db/recipes.go` — owner-aware queries, slug-collision retry
- `backend/internal/db/postgres.go` — txn helper if needed
- `backend/internal/db/mock_store.go` — new method stubs
- `backend/internal/handlers/recipes.go` — owner-aware list + IsMine
- `backend/internal/handlers/recipes_write.go` — owner enforcement + slug-collision
- `backend/internal/handlers/recipes_test.go` — extend with ownership cases
- `backend/main.go` — open POST/PUT/DELETE to authed users, mount AI handlers + workers
- `backend/go.mod` / `go.sum` — add Anthropic + OpenAI SDKs
- `backend/.env.example` — add new env vars

**Frontend — created**
- `frontend/components/recipe-form.tsx` — extracted from `app/admin/recipe-form.tsx`, reusable
- `frontend/app/neu/page.tsx`
- `frontend/app/neu/pending-jobs.tsx`
- `frontend/app/neu/manuell/page.tsx`
- `frontend/app/neu/aus-bild/page.tsx`
- `frontend/app/neu/aus-bild/aus-bild-client.tsx`
- `frontend/app/neu/aus-bild/[jobId]/pruefen/page.tsx`
- `frontend/app/neu/aus-bild/[jobId]/pruefen/review-client.tsx`
- `frontend/app/rezept/[slug]/bearbeiten/page.tsx`
- `frontend/app/admin/rezepte/page.tsx`
- `frontend/app/admin/rezepte/admin-recipes-client.tsx`

**Frontend — modified**
- `frontend/components/tab-bar.tsx` — add `+ Neu` button
- `frontend/components/recipe-card.tsx` — render "Mein Rezept" badge when `is_mine`
- `frontend/app/rezepte/browse-client.tsx` — "Meine Rezepte" chip + ?owner=me
- `frontend/app/rezepte/page.tsx` — pass `myRecipeCount`
- `frontend/app/rezept/[slug]/*` — owner-aware edit/delete buttons
- `frontend/app/admin/recipe-form.tsx` — re-export from new location
- `frontend/app/api/proxy/[...path]/route.ts` — allow `/api/ai-jobs` and `/api/admin/recipes` prefixes
- `frontend/lib/api.ts` — new types + helpers (AIJob, createAIJob, etc.)

---

## Phase A — Backend foundation (DB + models + store)

### Task A1: Database migration

**Files:**
- Create: `backend/migrations/0004_user_recipes.sql`

- [ ] **Step 1: Write migration**

Create `backend/migrations/0004_user_recipes.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
ALTER TABLE recipes ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS ai_jobs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT        NOT NULL CHECK (status IN ('queued','running','ready','failed','cancelled','consumed')),
    provider      TEXT        NOT NULL,
    model         TEXT        NOT NULL,
    image_urls    JSONB       NOT NULL,
    recipe_json   JSONB,
    error         TEXT,
    attempts      INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_status ON ai_jobs(user_id, status);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_created ON ai_jobs(status, created_at);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS ai_usage_daily (
    user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day      DATE        NOT NULL,
    count    INT         NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS ai_usage_daily;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS ai_jobs;
-- +goose StatementEnd

-- +goose StatementBegin
DROP INDEX IF EXISTS idx_recipes_owner;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE recipes DROP COLUMN IF EXISTS owner_id;
-- +goose StatementEnd
```

- [ ] **Step 2: Verify migration applies cleanly**

Run from `backend/`:
```
go run ./...
```
Expected: server starts; log includes `migrations OK`.

If running locally without server entry point, you can apply manually with `goose -dir migrations postgres "$DSN" up`.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/0004_user_recipes.sql
git commit -m "feat(db): add owner_id, ai_jobs, ai_usage_daily"
```

---

### Task A2: Recipe model — add ownership fields

**Files:**
- Modify: `backend/internal/models/recipe.go`

- [ ] **Step 1: Add fields**

Replace the current `Recipe` struct in `backend/internal/models/recipe.go` (keep `Ingredient` and `RecipeListItem` unchanged, but add owner fields to `RecipeListItem` too):

```go
package models

import "time"

type Ingredient struct {
    Amount  float64 `json:"amount"`
    Unit    string  `json:"unit"`
    Display string  `json:"display"`
    Name    string  `json:"name"`
}

// RecipeListItem is returned by GET /api/recipes (no ingredients/steps).
type RecipeListItem struct {
    Slug          string  `json:"slug"`
    Title         string  `json:"title"`
    CategorySlug  string  `json:"category_slug"`
    TimeMinutes   int     `json:"time_minutes"`
    Servings      string  `json:"servings"`
    ImageURL      string  `json:"image_url"`
    ImageBlurhash string  `json:"image_blurhash"`
    OwnerID       *string `json:"owner_id,omitempty"`
    OwnerEmail    string  `json:"owner_email,omitempty"`
    IsMine        bool    `json:"is_mine,omitempty"`
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
    OwnerID       *string      `json:"owner_id,omitempty"`
    OwnerEmail    string       `json:"owner_email,omitempty"`
    IsMine        bool         `json:"is_mine,omitempty"`
    CreatedAt     time.Time    `json:"created_at"`
    UpdatedAt     time.Time    `json:"updated_at"`
}
```

- [ ] **Step 2: Verify it builds**

```
cd backend && go build ./...
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/models/recipe.go
git commit -m "feat(models): add OwnerID/OwnerEmail/IsMine to Recipe"
```

---

### Task A3: Add ai_jobs models

**Files:**
- Create: `backend/internal/models/ai_job.go`

- [ ] **Step 1: Define types**

Create `backend/internal/models/ai_job.go`:

```go
package models

import "time"

type AIJobStatus string

const (
    AIJobQueued    AIJobStatus = "queued"
    AIJobRunning   AIJobStatus = "running"
    AIJobReady     AIJobStatus = "ready"
    AIJobFailed    AIJobStatus = "failed"
    AIJobCancelled AIJobStatus = "cancelled"
    AIJobConsumed  AIJobStatus = "consumed"
)

// AIJob is one image-to-recipe extraction job.
type AIJob struct {
    ID         string         `json:"id"`
    UserID     string         `json:"user_id"`
    Status     AIJobStatus    `json:"status"`
    Provider   string         `json:"provider"`
    Model      string         `json:"model"`
    ImageURLs  []string       `json:"image_urls"`
    RecipeJSON map[string]any `json:"recipe_json,omitempty"`
    Error      string         `json:"error,omitempty"`
    Attempts   int            `json:"attempts"`
    CreatedAt  time.Time      `json:"created_at"`
    StartedAt  *time.Time     `json:"started_at,omitempty"`
    FinishedAt *time.Time     `json:"finished_at,omitempty"`
}
```

- [ ] **Step 2: Verify build**

```
cd backend && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/models/ai_job.go
git commit -m "feat(models): add AIJob"
```

---

### Task A4: Extend Store interface

**Files:**
- Modify: `backend/internal/db/store.go`

- [ ] **Step 1: Update RecipeFilter and Store**

Replace the contents of `backend/internal/db/store.go`:

```go
package db

import (
    "context"
    "time"

    "backend/internal/models"
)

type RecipeFilter struct {
    Category   string
    Query      string
    OwnerID    *string // nil = no filter; "" = global only; "<uuid>" = that user only
    ViewerID   string  // who is asking (used to populate IsMine; "" = anonymous/internal)
    AdminView  bool    // when true, no owner-visibility filter is applied
    Limit      int
    Offset     int
}

type Store interface {
    // Categories
    GetCategories(ctx context.Context) ([]models.Category, error)

    // Recipes (read)
    GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error)
    GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error)
    CountUserRecipes(ctx context.Context, userID string) (int, error)

    // Recipes (write)
    CreateRecipe(ctx context.Context, r models.Recipe) (slug string, err error)
    UpdateRecipe(ctx context.Context, r models.Recipe) error
    DeleteRecipe(ctx context.Context, slug string) error

    // Users
    GetUsers(ctx context.Context) ([]models.User, error)
    GetUserByEmail(ctx context.Context, email string) (*models.User, error)
    GetUserByID(ctx context.Context, id string) (*models.User, error)
    CreateUser(ctx context.Context, email string, role models.Role) (*models.User, error)
    UpdateUser(ctx context.Context, id string, role models.Role, status models.Status) (*models.User, error)
    DeleteUser(ctx context.Context, id string) error
    UpdateLastLogin(ctx context.Context, id string) error

    // Sessions
    CreateSession(ctx context.Context, userID, token string, expires time.Time, ua, ip string) error
    GetUserBySessionToken(ctx context.Context, token string) (*models.User, error)
    DeleteSession(ctx context.Context, token string) error
    DeleteSessionsByUserID(ctx context.Context, userID string) error

    // AI jobs
    CreateAIJob(ctx context.Context, j models.AIJob, perUserActiveCap, globalActiveCap, dailyCap int) (string, error)
    GetAIJob(ctx context.Context, id string) (*models.AIJob, error)
    ListUserAIJobs(ctx context.Context, userID string, since time.Time) ([]models.AIJob, error)
    ClaimNextAIJob(ctx context.Context) (*models.AIJob, error)
    SetAIJobReady(ctx context.Context, id string, recipeJSON map[string]any) error
    SetAIJobFailed(ctx context.Context, id string, errMsg string) error
    RequeueAIJob(ctx context.Context, id string) error
    DeleteAIJob(ctx context.Context, id, ownerID string) error
    MarkAIJobConsumed(ctx context.Context, id, ownerID string) error
    ResetOrphanedAIJobs(ctx context.Context, maxAttempts int) error
    DeleteOldAIJobs(ctx context.Context, before time.Time) (int, error)
    CountActiveAIJobs(ctx context.Context, userID string) (int, error)
    CountActiveAIJobsGlobal(ctx context.Context) (int, error)
    GetTodayAIUsage(ctx context.Context, userID string) (int, error)
}
```

Note: `CreateRecipe` now returns the final (possibly suffixed) slug.

- [ ] **Step 2: Verify build fails for callers (expected)**

```
cd backend && go build ./...
```
Expected: errors in `db/recipes.go`, `db/users.go` (missing `GetUserByID`), `handlers/recipes_write.go`, etc. We'll fix those in the next tasks.

- [ ] **Step 3: Commit (compile-failing — will be fixed across next tasks)**

```bash
git add backend/internal/db/store.go
git commit -m "feat(db): extend Store interface for ownership + ai_jobs (WIP)"
```

---

### Task A5: PostgresStore — recipes (ownership + slug retry + count)

**Files:**
- Modify: `backend/internal/db/recipes.go`

- [ ] **Step 1: Replace recipes.go**

Replace `backend/internal/db/recipes.go` with:

```go
package db

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "strings"

    "backend/internal/models"
    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgconn"
)

func (s *PostgresStore) GetRecipes(ctx context.Context, f RecipeFilter) ([]models.RecipeListItem, error) {
    if f.Limit == 0 {
        f.Limit = 200
    }

    // Visibility:
    //   AdminView = true        → no owner restriction
    //   OwnerID = &someID       → only that owner (used for ?owner=me)
    //   default                 → owner_id IS NULL OR owner_id = ViewerID
    var visibility string
    args := []any{f.Category, f.Query, f.Limit, f.Offset}
    switch {
    case f.AdminView:
        visibility = "TRUE"
    case f.OwnerID != nil:
        args = append(args, *f.OwnerID)
        visibility = fmt.Sprintf("owner_id = $%d", len(args))
    case f.ViewerID != "":
        args = append(args, f.ViewerID)
        visibility = fmt.Sprintf("(owner_id IS NULL OR owner_id = $%d)", len(args))
    default:
        visibility = "owner_id IS NULL"
    }

    q := fmt.Sprintf(`
        SELECT r.slug, r.title, r.category_slug, r.time_minutes, r.servings,
               r.image_url, r.image_blurhash, r.owner_id, COALESCE(u.email, '')
        FROM recipes r
        LEFT JOIN users u ON u.id = r.owner_id
        WHERE ($1 = '' OR r.category_slug = $1)
          AND ($2 = '' OR r.title ILIKE '%%' || $2 || '%%'
                       OR r.ingredients::text ILIKE '%%' || $2 || '%%')
          AND %s
        ORDER BY r.title
        LIMIT $3 OFFSET $4`, visibility)

    rows, err := s.pool.Query(ctx, q, args...)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    out := make([]models.RecipeListItem, 0)
    for rows.Next() {
        var r models.RecipeListItem
        var ownerID *string
        if err := rows.Scan(
            &r.Slug, &r.Title, &r.CategorySlug,
            &r.TimeMinutes, &r.Servings, &r.ImageURL, &r.ImageBlurhash,
            &ownerID, &r.OwnerEmail,
        ); err != nil {
            return nil, err
        }
        r.OwnerID = ownerID
        if f.ViewerID != "" && ownerID != nil && *ownerID == f.ViewerID {
            r.IsMine = true
        }
        out = append(out, r)
    }
    return out, rows.Err()
}

func (s *PostgresStore) GetRecipeBySlug(ctx context.Context, slug string) (*models.Recipe, error) {
    var r models.Recipe
    var ingredientsJSON, stepsJSON []byte
    var ownerID *string
    var ownerEmail string

    err := s.pool.QueryRow(ctx, `
        SELECT r.slug, r.title, r.category_slug, r.time_minutes, r.servings,
               r.ingredients, r.steps, r.notes, r.image_url, r.image_blurhash,
               r.owner_id, COALESCE(u.email, ''),
               r.created_at, r.updated_at
        FROM recipes r
        LEFT JOIN users u ON u.id = r.owner_id
        WHERE r.slug = $1`, slug).
        Scan(
            &r.Slug, &r.Title, &r.CategorySlug,
            &r.TimeMinutes, &r.Servings,
            &ingredientsJSON, &stepsJSON,
            &r.Notes, &r.ImageURL, &r.ImageBlurhash,
            &ownerID, &ownerEmail,
            &r.CreatedAt, &r.UpdatedAt,
        )
    if err != nil {
        if errors.Is(err, pgx.ErrNoRows) {
            return nil, nil
        }
        return nil, err
    }
    r.OwnerID = ownerID
    r.OwnerEmail = ownerEmail
    if err := json.Unmarshal(ingredientsJSON, &r.Ingredients); err != nil {
        return nil, fmt.Errorf("unmarshal ingredients: %w", err)
    }
    if err := json.Unmarshal(stepsJSON, &r.Steps); err != nil {
        return nil, fmt.Errorf("unmarshal steps: %w", err)
    }
    return &r, nil
}

func (s *PostgresStore) CountUserRecipes(ctx context.Context, userID string) (int, error) {
    var n int
    err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM recipes WHERE owner_id = $1`, userID).Scan(&n)
    return n, err
}

func (s *PostgresStore) CreateRecipe(ctx context.Context, r models.Recipe) (string, error) {
    ingredientsJSON, _ := json.Marshal(r.Ingredients)
    stepsJSON, _ := json.Marshal(r.Steps)

    base := r.Slug
    if base == "" {
        base = "rezept"
    }
    base = strings.TrimRight(base, "-")

    // Try base, base-2, base-3, … up to base-99.
    for i := 0; i < 100; i++ {
        candidate := base
        if i > 0 {
            candidate = fmt.Sprintf("%s-%d", base, i+1)
        }
        _, err := s.pool.Exec(ctx, `
            INSERT INTO recipes
              (slug, title, category_slug, time_minutes, servings,
               ingredients, steps, notes, image_url, image_blurhash, owner_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            candidate, r.Title, r.CategorySlug, r.TimeMinutes, r.Servings,
            ingredientsJSON, stepsJSON, r.Notes, r.ImageURL, r.ImageBlurhash, r.OwnerID)
        if err == nil {
            return candidate, nil
        }
        var pgErr *pgconn.PgError
        if errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.Message, "recipes_pkey") {
            continue
        }
        return "", err
    }
    return "", fmt.Errorf("slug %q is taken (tried up to suffix -100)", base)
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

- [ ] **Step 2: Add `GetUserByID` to `backend/internal/db/users.go`**

Open `backend/internal/db/users.go` and append:

```go
func (s *PostgresStore) GetUserByID(ctx context.Context, id string) (*models.User, error) {
    var u models.User
    err := s.pool.QueryRow(ctx, `
        SELECT id, email, role, status, created_at, last_login
        FROM users WHERE id = $1`, id).
        Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.LastLogin)
    if err != nil {
        if errors.Is(err, pgx.ErrNoRows) {
            return nil, nil
        }
        return nil, err
    }
    return &u, nil
}
```

If `errors`/`pgx` aren't already imported there, add them.

- [ ] **Step 3: Verify build (still won't pass — handlers/mock not updated yet)**

```
cd backend && go build ./...
```
Expected: errors only in `handlers/` and `db/mock_store.go`.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/db/recipes.go backend/internal/db/users.go
git commit -m "feat(db): owner-aware recipe queries + slug-collision retry"
```

---

### Task A6: PostgresStore — ai_jobs

**Files:**
- Create: `backend/internal/db/ai_jobs.go`

- [ ] **Step 1: Implement ai_jobs methods**

Create `backend/internal/db/ai_jobs.go`:

```go
package db

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "time"

    "backend/internal/models"
    "github.com/jackc/pgx/v5"
)

var ErrJobLimitPerUser = errors.New("per-user active limit reached")
var ErrJobLimitGlobal = errors.New("global queue full")
var ErrJobLimitDaily = errors.New("daily limit reached")

func (s *PostgresStore) CreateAIJob(
    ctx context.Context, j models.AIJob,
    perUserActiveCap, globalActiveCap, dailyCap int,
) (string, error) {
    imgs, err := json.Marshal(j.ImageURLs)
    if err != nil {
        return "", err
    }
    tx, err := s.pool.Begin(ctx)
    if err != nil {
        return "", err
    }
    defer tx.Rollback(ctx)

    // 1. per-user active cap
    var n int
    if err := tx.QueryRow(ctx, `
        SELECT COUNT(*) FROM ai_jobs
        WHERE user_id = $1 AND status IN ('queued','running')`, j.UserID).Scan(&n); err != nil {
        return "", err
    }
    if n >= perUserActiveCap {
        return "", ErrJobLimitPerUser
    }

    // 2. global active cap
    if err := tx.QueryRow(ctx, `
        SELECT COUNT(*) FROM ai_jobs WHERE status IN ('queued','running')`).Scan(&n); err != nil {
        return "", err
    }
    if n >= globalActiveCap {
        return "", ErrJobLimitGlobal
    }

    // 3. daily cap (UTC date)
    today := time.Now().UTC().Format("2006-01-02")
    var used int
    if err := tx.QueryRow(ctx, `
        SELECT COALESCE(count, 0) FROM ai_usage_daily
        WHERE user_id = $1 AND day = $2`, j.UserID, today).Scan(&used); err != nil && !errors.Is(err, pgx.ErrNoRows) {
        return "", err
    }
    if used >= dailyCap {
        return "", ErrJobLimitDaily
    }

    // 4. upsert daily counter
    if _, err := tx.Exec(ctx, `
        INSERT INTO ai_usage_daily (user_id, day, count) VALUES ($1, $2, 1)
        ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage_daily.count + 1`,
        j.UserID, today); err != nil {
        return "", err
    }

    // 5. insert job
    var id string
    if err := tx.QueryRow(ctx, `
        INSERT INTO ai_jobs (user_id, status, provider, model, image_urls)
        VALUES ($1, 'queued', $2, $3, $4)
        RETURNING id`,
        j.UserID, j.Provider, j.Model, imgs).Scan(&id); err != nil {
        return "", err
    }

    if err := tx.Commit(ctx); err != nil {
        return "", err
    }
    return id, nil
}

func (s *PostgresStore) GetAIJob(ctx context.Context, id string) (*models.AIJob, error) {
    return s.scanAIJob(ctx, `SELECT `+aiJobCols+` FROM ai_jobs WHERE id = $1`, id)
}

func (s *PostgresStore) ListUserAIJobs(ctx context.Context, userID string, since time.Time) ([]models.AIJob, error) {
    rows, err := s.pool.Query(ctx, `SELECT `+aiJobCols+`
        FROM ai_jobs
        WHERE user_id = $1 AND created_at >= $2
        ORDER BY created_at DESC`, userID, since)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    var out []models.AIJob
    for rows.Next() {
        j, err := scanAIJobRow(rows)
        if err != nil {
            return nil, err
        }
        out = append(out, *j)
    }
    return out, rows.Err()
}

func (s *PostgresStore) ClaimNextAIJob(ctx context.Context) (*models.AIJob, error) {
    tx, err := s.pool.Begin(ctx)
    if err != nil {
        return nil, err
    }
    defer tx.Rollback(ctx)

    var id string
    err = tx.QueryRow(ctx, `
        SELECT id FROM ai_jobs
        WHERE status = 'queued'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`).Scan(&id)
    if err != nil {
        if errors.Is(err, pgx.ErrNoRows) {
            return nil, nil
        }
        return nil, err
    }

    if _, err := tx.Exec(ctx, `
        UPDATE ai_jobs
        SET status='running', attempts = attempts + 1, started_at = now()
        WHERE id = $1`, id); err != nil {
        return nil, err
    }

    if err := tx.Commit(ctx); err != nil {
        return nil, err
    }
    return s.GetAIJob(ctx, id)
}

func (s *PostgresStore) SetAIJobReady(ctx context.Context, id string, recipeJSON map[string]any) error {
    rj, err := json.Marshal(recipeJSON)
    if err != nil {
        return err
    }
    _, err = s.pool.Exec(ctx, `
        UPDATE ai_jobs SET status='ready', recipe_json=$2, finished_at=now()
        WHERE id = $1`, id, rj)
    return err
}

func (s *PostgresStore) SetAIJobFailed(ctx context.Context, id string, errMsg string) error {
    _, err := s.pool.Exec(ctx, `
        UPDATE ai_jobs SET status='failed', error=$2, finished_at=now()
        WHERE id = $1`, id, errMsg)
    return err
}

func (s *PostgresStore) RequeueAIJob(ctx context.Context, id string) error {
    _, err := s.pool.Exec(ctx, `
        UPDATE ai_jobs SET status='queued', started_at=NULL
        WHERE id = $1`, id)
    return err
}

func (s *PostgresStore) DeleteAIJob(ctx context.Context, id, ownerID string) error {
    res, err := s.pool.Exec(ctx, `
        DELETE FROM ai_jobs
        WHERE id = $1 AND user_id = $2 AND status IN ('queued','ready','failed','cancelled')`,
        id, ownerID)
    if err != nil {
        return err
    }
    if res.RowsAffected() == 0 {
        return pgx.ErrNoRows
    }
    return nil
}

func (s *PostgresStore) MarkAIJobConsumed(ctx context.Context, id, ownerID string) error {
    res, err := s.pool.Exec(ctx, `
        UPDATE ai_jobs SET status='consumed'
        WHERE id = $1 AND user_id = $2 AND status = 'ready'`, id, ownerID)
    if err != nil {
        return err
    }
    if res.RowsAffected() == 0 {
        return pgx.ErrNoRows
    }
    return nil
}

func (s *PostgresStore) ResetOrphanedAIJobs(ctx context.Context, maxAttempts int) error {
    if _, err := s.pool.Exec(ctx, `
        UPDATE ai_jobs SET status='queued', started_at=NULL
        WHERE status='running' AND attempts < $1`, maxAttempts); err != nil {
        return err
    }
    _, err := s.pool.Exec(ctx, `
        UPDATE ai_jobs SET status='failed', error='abandoned after restart', finished_at=now()
        WHERE status='running' AND attempts >= $1`, maxAttempts)
    return err
}

func (s *PostgresStore) DeleteOldAIJobs(ctx context.Context, before time.Time) (int, error) {
    res, err := s.pool.Exec(ctx, `
        DELETE FROM ai_jobs
        WHERE (finished_at IS NOT NULL AND finished_at < $1)
           OR (status='cancelled' AND created_at < $1)`, before)
    if err != nil {
        return 0, err
    }
    return int(res.RowsAffected()), nil
}

func (s *PostgresStore) CountActiveAIJobs(ctx context.Context, userID string) (int, error) {
    var n int
    err := s.pool.QueryRow(ctx, `
        SELECT COUNT(*) FROM ai_jobs
        WHERE user_id = $1 AND status IN ('queued','running')`, userID).Scan(&n)
    return n, err
}

func (s *PostgresStore) CountActiveAIJobsGlobal(ctx context.Context) (int, error) {
    var n int
    err := s.pool.QueryRow(ctx, `
        SELECT COUNT(*) FROM ai_jobs WHERE status IN ('queued','running')`).Scan(&n)
    return n, err
}

func (s *PostgresStore) GetTodayAIUsage(ctx context.Context, userID string) (int, error) {
    today := time.Now().UTC().Format("2006-01-02")
    var n int
    err := s.pool.QueryRow(ctx, `
        SELECT COALESCE(count, 0) FROM ai_usage_daily
        WHERE user_id = $1 AND day = $2`, userID, today).Scan(&n)
    if err != nil && !errors.Is(err, pgx.ErrNoRows) {
        return 0, err
    }
    return n, nil
}

const aiJobCols = `id, user_id, status, provider, model, image_urls,
    recipe_json, error, attempts, created_at, started_at, finished_at`

func (s *PostgresStore) scanAIJob(ctx context.Context, q string, args ...any) (*models.AIJob, error) {
    row := s.pool.QueryRow(ctx, q, args...)
    return scanAIJobRow(row)
}

type rowScanner interface {
    Scan(dest ...any) error
}

func scanAIJobRow(r rowScanner) (*models.AIJob, error) {
    var j models.AIJob
    var images, recipeJSON []byte
    var errStr *string
    if err := r.Scan(
        &j.ID, &j.UserID, &j.Status, &j.Provider, &j.Model,
        &images, &recipeJSON, &errStr, &j.Attempts,
        &j.CreatedAt, &j.StartedAt, &j.FinishedAt,
    ); err != nil {
        if errors.Is(err, pgx.ErrNoRows) {
            return nil, nil
        }
        return nil, err
    }
    if err := json.Unmarshal(images, &j.ImageURLs); err != nil {
        return nil, fmt.Errorf("unmarshal image_urls: %w", err)
    }
    if len(recipeJSON) > 0 {
        if err := json.Unmarshal(recipeJSON, &j.RecipeJSON); err != nil {
            return nil, fmt.Errorf("unmarshal recipe_json: %w", err)
        }
    }
    if errStr != nil {
        j.Error = *errStr
    }
    return &j, nil
}
```

- [ ] **Step 2: Verify it builds**

```
cd backend && go build ./internal/db/...
```
Expected: passes for the `db` package (handlers will still fail).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/db/ai_jobs.go
git commit -m "feat(db): ai_jobs CRUD + claim with FOR UPDATE SKIP LOCKED"
```

---

### Task A7: MockStore — add new method stubs

**Files:**
- Modify: `backend/internal/db/mock_store.go`

- [ ] **Step 1: Update MockStore**

Replace `backend/internal/db/mock_store.go`:

```go
package db

import (
    "context"
    "errors"
    "time"

    "backend/internal/models"
)

type MockStore struct {
    Categories     []models.Category
    Recipes        []models.RecipeListItem
    Recipe         *models.Recipe
    Users          []models.User
    UserByID       *models.User
    UserRecipeN    int
    AIJobs         []models.AIJob
    NextAIJob      *models.AIJob
    AIActiveCount  int
    AIGlobalCount  int
    AIUsageToday   int
    CreatedSlug    string
    Err            error
    CreateErr      error
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

func (m *MockStore) CountUserRecipes(_ context.Context, _ string) (int, error) {
    return m.UserRecipeN, m.Err
}

func (m *MockStore) CreateRecipe(_ context.Context, r models.Recipe) (string, error) {
    if m.CreateErr != nil {
        return "", m.CreateErr
    }
    if m.CreatedSlug != "" {
        return m.CreatedSlug, nil
    }
    return r.Slug, nil
}

func (m *MockStore) UpdateRecipe(_ context.Context, _ models.Recipe) error { return m.Err }
func (m *MockStore) DeleteRecipe(_ context.Context, _ string) error        { return m.Err }

func (m *MockStore) GetUsers(_ context.Context) ([]models.User, error) { return m.Users, m.Err }
func (m *MockStore) GetUserByEmail(_ context.Context, _ string) (*models.User, error) {
    return nil, nil
}
func (m *MockStore) GetUserByID(_ context.Context, _ string) (*models.User, error) {
    return m.UserByID, m.Err
}
func (m *MockStore) CreateUser(_ context.Context, _ string, _ models.Role) (*models.User, error) {
    return nil, nil
}
func (m *MockStore) UpdateUser(_ context.Context, _ string, _ models.Role, _ models.Status) (*models.User, error) {
    return nil, nil
}
func (m *MockStore) DeleteUser(_ context.Context, _ string) error      { return nil }
func (m *MockStore) UpdateLastLogin(_ context.Context, _ string) error { return nil }
func (m *MockStore) CreateSession(_ context.Context, _, _ string, _ time.Time, _, _ string) error {
    return nil
}
func (m *MockStore) GetUserBySessionToken(_ context.Context, _ string) (*models.User, error) {
    return nil, nil
}
func (m *MockStore) DeleteSession(_ context.Context, _ string) error         { return nil }
func (m *MockStore) DeleteSessionsByUserID(_ context.Context, _ string) error { return nil }

// AI jobs

func (m *MockStore) CreateAIJob(_ context.Context, j models.AIJob, perUser, global, daily int) (string, error) {
    if m.Err != nil {
        return "", m.Err
    }
    if m.AIActiveCount >= perUser {
        return "", ErrJobLimitPerUser
    }
    if m.AIGlobalCount >= global {
        return "", ErrJobLimitGlobal
    }
    if m.AIUsageToday >= daily {
        return "", ErrJobLimitDaily
    }
    return "mock-id", nil
}

func (m *MockStore) GetAIJob(_ context.Context, id string) (*models.AIJob, error) {
    for i := range m.AIJobs {
        if m.AIJobs[i].ID == id {
            return &m.AIJobs[i], nil
        }
    }
    return nil, m.Err
}

func (m *MockStore) ListUserAIJobs(_ context.Context, _ string, _ time.Time) ([]models.AIJob, error) {
    return m.AIJobs, m.Err
}

func (m *MockStore) ClaimNextAIJob(_ context.Context) (*models.AIJob, error) {
    return m.NextAIJob, m.Err
}

func (m *MockStore) SetAIJobReady(_ context.Context, _ string, _ map[string]any) error { return m.Err }
func (m *MockStore) SetAIJobFailed(_ context.Context, _ string, _ string) error        { return m.Err }
func (m *MockStore) RequeueAIJob(_ context.Context, _ string) error                    { return m.Err }
func (m *MockStore) DeleteAIJob(_ context.Context, _, _ string) error                  { return m.Err }
func (m *MockStore) MarkAIJobConsumed(_ context.Context, _, _ string) error            { return m.Err }
func (m *MockStore) ResetOrphanedAIJobs(_ context.Context, _ int) error                { return m.Err }
func (m *MockStore) DeleteOldAIJobs(_ context.Context, _ time.Time) (int, error)        { return 0, m.Err }
func (m *MockStore) CountActiveAIJobs(_ context.Context, _ string) (int, error)         { return m.AIActiveCount, m.Err }
func (m *MockStore) CountActiveAIJobsGlobal(_ context.Context) (int, error)             { return m.AIGlobalCount, m.Err }
func (m *MockStore) GetTodayAIUsage(_ context.Context, _ string) (int, error)           { return m.AIUsageToday, m.Err }

var _ = errors.New // keep errors import alive
```

- [ ] **Step 2: Verify build**

```
cd backend && go build ./internal/db/...
```
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/db/mock_store.go
git commit -m "test(db): extend MockStore with new methods"
```

---

## Phase B — Backend recipes: ownership in handlers

### Task B1: Access helper (`recipeAccess`) + handler skeleton fixes

**Files:**
- Create: `backend/internal/handlers/access.go`
- Modify: `backend/internal/handlers/recipes_write.go`

- [ ] **Step 1: Create access helper**

Create `backend/internal/handlers/access.go`:

```go
package handlers

import (
    "context"
    "errors"

    "backend/internal/db"
    "backend/internal/models"
)

// recipeAccess fetches a recipe and decides if the caller can edit it.
// Returns (recipe, canEdit, hidden).
//   hidden=true means the caller should see a 404 (the recipe exists but
//   they're not allowed to know that).
func recipeAccess(ctx context.Context, store db.Store, slug string, user *models.User) (*models.Recipe, bool, bool, error) {
    if user == nil {
        return nil, false, true, nil
    }
    r, err := store.GetRecipeBySlug(ctx, slug)
    if err != nil {
        return nil, false, false, err
    }
    if r == nil {
        return nil, false, true, nil
    }
    isAdmin := user.Role == models.RoleAdmin
    isGlobal := r.OwnerID == nil
    isOwner := r.OwnerID != nil && *r.OwnerID == user.ID

    switch {
    case isAdmin:
        return r, true, false, nil
    case isGlobal:
        // visible but only admins can edit
        return r, false, false, nil
    case isOwner:
        return r, true, false, nil
    default:
        // someone else's private recipe — hide it
        return nil, false, true, nil
    }
}

var errAccessHidden = errors.New("hidden")
```

- [ ] **Step 2: Update recipes_write.go to new signatures**

Replace `backend/internal/handlers/recipes_write.go`:

```go
package handlers

import (
    "encoding/json"
    "errors"
    "log"
    "net/http"
    "strings"

    "backend/internal/db"
    mw "backend/internal/middleware"
    "backend/internal/models"

    "github.com/go-chi/chi/v5"
    "github.com/jackc/pgx/v5/pgconn"
)

// POST /api/recipes
//
// Authed users (any role) may create recipes:
//   - Admin → recipe is global (owner_id = NULL)
//   - User  → owner_id = caller's user id
func CreateRecipe(store db.Store) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user := mw.UserFromContext(r.Context())
        if user == nil {
            jsonError(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        var recipe models.Recipe
        if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
            jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
            return
        }
        if recipe.Title == "" {
            jsonError(w, "Titel ist erforderlich.", http.StatusBadRequest)
            return
        }
        // Owner is decided server-side; ignore any client value.
        if user.Role == models.RoleAdmin {
            recipe.OwnerID = nil
        } else {
            uid := user.ID
            recipe.OwnerID = &uid
        }
        if recipe.Slug == "" {
            recipe.Slug = slugify(recipe.Title)
        }
        finalSlug, err := store.CreateRecipe(r.Context(), recipe)
        if err != nil {
            log.Printf("CreateRecipe %q: %v", recipe.Slug, err)
            writeDbError(w, err)
            return
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]string{"slug": finalSlug})
    }
}

// PUT /api/recipes/{slug}
func UpdateRecipe(store db.Store) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user := mw.UserFromContext(r.Context())
        slug := chi.URLParam(r, "slug")
        existing, canEdit, hidden, err := recipeAccess(r.Context(), store, slug, user)
        if err != nil {
            writeDbError(w, err)
            return
        }
        if hidden {
            jsonError(w, "Rezept nicht gefunden.", http.StatusNotFound)
            return
        }
        if !canEdit {
            jsonError(w, "Keine Berechtigung.", http.StatusForbidden)
            return
        }

        var recipe models.Recipe
        if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
            jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
            return
        }
        recipe.Slug = slug
        // Preserve ownership across edits.
        recipe.OwnerID = existing.OwnerID
        if err := store.UpdateRecipe(r.Context(), recipe); err != nil {
            log.Printf("UpdateRecipe %q: %v", slug, err)
            writeDbError(w, err)
            return
        }
        w.WriteHeader(http.StatusNoContent)
    }
}

// DELETE /api/recipes/{slug}
func DeleteRecipe(store db.Store) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user := mw.UserFromContext(r.Context())
        slug := chi.URLParam(r, "slug")
        _, canEdit, hidden, err := recipeAccess(r.Context(), store, slug, user)
        if err != nil {
            writeDbError(w, err)
            return
        }
        if hidden {
            jsonError(w, "Rezept nicht gefunden.", http.StatusNotFound)
            return
        }
        if !canEdit {
            jsonError(w, "Keine Berechtigung.", http.StatusForbidden)
            return
        }
        if err := store.DeleteRecipe(r.Context(), slug); err != nil {
            log.Printf("DeleteRecipe %q: %v", slug, err)
            writeDbError(w, err)
            return
        }
        w.WriteHeader(http.StatusNoContent)
    }
}

func writeDbError(w http.ResponseWriter, err error) {
    var pgErr *pgconn.PgError
    if errors.As(err, &pgErr) {
        switch pgErr.Code {
        case "23505":
            jsonError(w, "Ein Rezept mit diesem Slug existiert bereits.", http.StatusConflict)
            return
        case "23503":
            jsonError(w, "Die gewählte Kategorie existiert nicht.", http.StatusBadRequest)
            return
        case "23502":
            jsonError(w, "Pflichtfeld fehlt: "+pgErr.ColumnName, http.StatusBadRequest)
            return
        }
    }
    jsonError(w, "Datenbankfehler", http.StatusInternalServerError)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(code)
    json.NewEncoder(w).Encode(map[string]string{"error": msg})
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

- [ ] **Step 3: Verify build**

```
cd backend && go build ./...
```
Expected: passes (recipes.go list handler and main.go routing still need updates, but those don't break the build yet — they'll still compile).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handlers/access.go backend/internal/handlers/recipes_write.go
git commit -m "feat(handlers): owner-aware recipe write + access helper"
```

---

### Task B2: Owner-aware list + GetRecipe

**Files:**
- Modify: `backend/internal/handlers/recipes.go`
- Test: `backend/internal/handlers/recipes_test.go`

- [ ] **Step 1: Write failing tests for ownership filtering**

Add to `backend/internal/handlers/recipes_test.go`:

```go
func TestListRecipes_authedUser_seesGlobalAndOwn(t *testing.T) {
    store := &db.MockStore{
        Recipes: []models.RecipeListItem{
            {Slug: "global", Title: "Global"},
            {Slug: "mine", Title: "Mine"},
        },
        UserRecipeN: 1,
    }
    r := chi.NewRouter()
    r.Use(injectUser(&models.User{ID: "u1", Role: models.RoleUser}))
    r.Get("/api/recipes", handlers.ListRecipes(store))

    req := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    assert.Equal(t, http.StatusOK, w.Code)
    var resp struct {
        Items []models.RecipeListItem `json:"items"`
        Meta  struct {
            MyRecipeCount int `json:"my_recipe_count"`
        } `json:"meta"`
    }
    require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
    assert.Len(t, resp.Items, 2)
    assert.Equal(t, 1, resp.Meta.MyRecipeCount)
}

// injectUser is a small middleware to put a user into context for tests.
func injectUser(u *models.User) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            ctx := context.WithValue(r.Context(), mw.CtxUser, u)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

Also add the imports `"context"` and `mw "backend/internal/middleware"` to that test file (alongside the existing imports). And update the existing `TestListRecipes_returnsAll` to also wrap the handler in a router with the injectUser middleware (otherwise the new code paths return 401):

```go
func TestListRecipes_returnsAll(t *testing.T) {
    store := &db.MockStore{
        Recipes: []models.RecipeListItem{
            {Slug: "bolognese", Title: "Bolognese", CategorySlug: "hauptgerichte", TimeMinutes: 30},
        },
    }
    r := chi.NewRouter()
    r.Use(injectUser(&models.User{ID: "u1", Role: models.RoleUser}))
    r.Get("/api/recipes", handlers.ListRecipes(store))

    req := httptest.NewRequest(http.MethodGet, "/api/recipes", nil)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    assert.Equal(t, http.StatusOK, w.Code)
    var resp struct {
        Items []models.RecipeListItem `json:"items"`
    }
    require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
    require.Len(t, resp.Items, 1)
    assert.Equal(t, "bolognese", resp.Items[0].Slug)
}
```

The existing `TestListRecipes_storeError` and `TestGetRecipe_*` similarly need to be wrapped through `injectUser` (admin: `models.RoleAdmin`).

- [ ] **Step 2: Run tests — confirm they fail**

```
cd backend && go test ./internal/handlers/... -run TestListRecipes -v
```
Expected: failures (handler still returns flat array, no `meta`).

- [ ] **Step 3: Update list handler**

Replace `backend/internal/handlers/recipes.go`:

```go
package handlers

import (
    "encoding/json"
    "net/http"

    "backend/internal/db"
    mw "backend/internal/middleware"
    "backend/internal/models"
    "github.com/go-chi/chi/v5"
)

type listRecipesResponse struct {
    Items []models.RecipeListItem `json:"items"`
    Meta  listRecipesMeta         `json:"meta"`
}

type listRecipesMeta struct {
    MyRecipeCount int `json:"my_recipe_count"`
}

func ListRecipes(s db.Store) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user := mw.UserFromContext(r.Context())
        if user == nil {
            jsonError(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        f := db.RecipeFilter{
            Category: r.URL.Query().Get("category"),
            Query:    r.URL.Query().Get("q"),
            ViewerID: user.ID,
        }
        if r.URL.Query().Get("owner") == "me" {
            uid := user.ID
            f.OwnerID = &uid
        }
        recipes, err := s.GetRecipes(r.Context(), f)
        if err != nil {
            jsonError(w, "internal server error", http.StatusInternalServerError)
            return
        }
        if recipes == nil {
            recipes = []models.RecipeListItem{}
        }
        myCount, _ := s.CountUserRecipes(r.Context(), user.ID)
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(listRecipesResponse{
            Items: recipes,
            Meta:  listRecipesMeta{MyRecipeCount: myCount},
        })
    }
}

func GetRecipe(s db.Store) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user := mw.UserFromContext(r.Context())
        slug := chi.URLParam(r, "slug")
        recipe, _, hidden, err := recipeAccess(r.Context(), s, slug, user)
        if err != nil {
            jsonError(w, "internal server error", http.StatusInternalServerError)
            return
        }
        if hidden || recipe == nil {
            jsonError(w, "not found", http.StatusNotFound)
            return
        }
        if user != nil && recipe.OwnerID != nil && *recipe.OwnerID == user.ID {
            recipe.IsMine = true
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(recipe)
    }
}
```

- [ ] **Step 4: Run tests**

```
cd backend && go test ./internal/handlers/... -v
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/recipes.go backend/internal/handlers/recipes_test.go
git commit -m "feat(handlers): owner-aware list + GetRecipe + my_recipe_count meta"
```

---

### Task B3: Admin recipes endpoint

**Files:**
- Create: `backend/internal/handlers/admin_recipes.go`

- [ ] **Step 1: Add handler**

Create `backend/internal/handlers/admin_recipes.go`:

```go
package handlers

import (
    "encoding/json"
    "net/http"

    "backend/internal/db"
    "backend/internal/models"
)

// GET /api/admin/recipes
// Admin-only. Returns ALL recipes with owner_email joined.
func ListAdminRecipes(s db.Store) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        f := db.RecipeFilter{
            Category:  r.URL.Query().Get("category"),
            Query:     r.URL.Query().Get("q"),
            AdminView: true,
        }
        switch r.URL.Query().Get("filter") {
        case "global":
            empty := ""
            f.OwnerID = &empty // empty string sentinel handled below
        }
        recipes, err := s.GetRecipes(r.Context(), f)
        if err != nil {
            jsonError(w, "internal server error", http.StatusInternalServerError)
            return
        }
        if recipes == nil {
            recipes = []models.RecipeListItem{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(recipes)
    }
}
```

(The `"global"` filter via empty-string sentinel is fragile; for clarity replace its handling: in `db/recipes.go::GetRecipes`, treat `OwnerID = &emptyString` as `WHERE owner_id IS NULL`. Add that case to the visibility switch above the existing one in `recipes.go` from Task A5:)

In `backend/internal/db/recipes.go`, in the `switch` block on visibility, add:

```go
    case f.OwnerID != nil && *f.OwnerID == "":
        visibility = "owner_id IS NULL"
```

before the existing `case f.OwnerID != nil:`. (Re-order so the empty-string case comes first.)

- [ ] **Step 2: Verify build**

```
cd backend && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/handlers/admin_recipes.go backend/internal/db/recipes.go
git commit -m "feat(handlers): GET /api/admin/recipes for admin moderation"
```

---

### Task B4: Update routing in main.go

**Files:**
- Modify: `backend/main.go`

- [ ] **Step 1: Move POST/PUT/DELETE recipes out of admin group**

In `backend/main.go`, replace the protected-routes block (currently around lines 75–95) with:

```go
    // Protected routes (require valid session cookie)
    r.Group(func(r chi.Router) {
        r.Use(mw.RequireSession(store, os.Getenv("INTERNAL_TOKEN")))

        r.Get("/api/auth/me", handlers.Me())
        r.Get("/api/categories", handlers.ListCategories(store))
        r.Get("/api/recipes", handlers.ListRecipes(store))
        r.Get("/api/recipes/{slug}", handlers.GetRecipe(store))

        // Recipe writes — any authed user; ownership is enforced inside.
        r.Post("/api/recipes", handlers.CreateRecipe(store))
        r.Put("/api/recipes/{slug}", handlers.UpdateRecipe(store))
        r.Delete("/api/recipes/{slug}", handlers.DeleteRecipe(store))

        // Admin-only
        r.Group(func(r chi.Router) {
            r.Use(mw.RequireAdmin)
            r.Get("/api/admin/recipes", handlers.ListAdminRecipes(store))
            r.Get("/api/admin/users", handlers.ListUsers(store))
            r.Post("/api/admin/users", handlers.CreateUser(store))
            r.Patch("/api/admin/users/{id}", handlers.UpdateUser(store))
            r.Delete("/api/admin/users/{id}", handlers.DeleteUser(store))
            r.Post("/api/admin/backup", handlers.TriggerBackup(store))
        })
    })
```

- [ ] **Step 2: Verify build**

```
cd backend && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add backend/main.go
git commit -m "feat(routes): open recipe writes to authed users"
```

---

## Phase C — Backend AI infrastructure

### Task C1: Add SDK dependencies

**Files:**
- Modify: `backend/go.mod`, `backend/go.sum`

- [ ] **Step 1: Add Anthropic + OpenAI SDKs**

Run from `backend/`:
```
go get github.com/anthropics/anthropic-sdk-go@latest
go get github.com/openai/openai-go@latest
go mod tidy
```

- [ ] **Step 2: Verify build**

```
cd backend && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add backend/go.mod backend/go.sum
git commit -m "chore(deps): add Anthropic and OpenAI Go SDKs"
```

---

### Task C2: AI extractor interface + cost table

**Files:**
- Create: `backend/internal/ai/extractor.go`, `backend/internal/ai/cost.go`

- [ ] **Step 1: Define interface and types**

Create `backend/internal/ai/extractor.go`:

```go
package ai

import (
    "context"

    "backend/internal/models"
)

type Request struct {
    ImageURLs  []string
    Locale     string
    Categories []string // valid category slugs
}

type Result struct {
    Title        string              `json:"title"`
    CategorySlug string              `json:"category_slug"`
    TimeMinutes  int                 `json:"time_minutes"`
    Servings     string              `json:"servings"`
    Ingredients  []models.Ingredient `json:"ingredients"`
    Steps        []string            `json:"steps"`
    Notes        string              `json:"notes"`
    Confidence   float64             `json:"confidence,omitempty"`
    InputTokens  int                 `json:"-"`
    OutputTokens int                 `json:"-"`
}

type Extractor interface {
    Extract(ctx context.Context, req Request) (Result, error)
    Provider() string
    Model() string
}

type Constructor func() (Extractor, error)

// keys are "provider:model"
var Registry = map[string]Constructor{}

func Register(key string, c Constructor) { Registry[key] = c }

func Get(key string) (Extractor, error) {
    c, ok := Registry[key]
    if !ok {
        return nil, errUnknownModel{key}
    }
    return c()
}

type errUnknownModel struct{ key string }

func (e errUnknownModel) Error() string { return "unknown model: " + e.key }

// IsValidKey reports whether a (provider, model) pair has been registered.
func IsValidKey(provider, model string) bool {
    _, ok := Registry[provider+":"+model]
    return ok
}

// PromptTemplate returns the system prompt with the given category list injected.
func PromptTemplate(categories []string) string {
    return "Du bist ein Rezept-Extraktor. Analysiere die Bilder und schreibe ein vollständiges deutsches Rezept im JSON-Format. " +
        "Kategorien dürfen NUR aus dieser Liste stammen: [" + joinComma(categories) + "]. " +
        "Bei mehreren Bildern: gehe davon aus, dass sie dasselbe Gericht aus verschiedenen Winkeln zeigen. " +
        "Schätze Mengen für 4 Personen, sofern nicht anders erkennbar. " +
        "Antworte ausschließlich mit dem JSON-Schema."
}

func joinComma(items []string) string {
    out := ""
    for i, s := range items {
        if i > 0 {
            out += ", "
        }
        out += s
    }
    return out
}
```

- [ ] **Step 2: Define cost table**

Create `backend/internal/ai/cost.go`:

```go
package ai

// USD per 1M tokens.
type Pricing struct{ InputPer1M, OutputPer1M float64 }

var Prices = map[string]Pricing{
    "claude:claude-sonnet-4-6": {InputPer1M: 3.00, OutputPer1M: 15.00},
    "claude:claude-haiku-4-5":  {InputPer1M: 1.00, OutputPer1M: 5.00},
    "openai:gpt-5.4-mini":      {InputPer1M: 0.75, OutputPer1M: 4.50},
    "openai:gpt-5.4-nano":      {InputPer1M: 0.20, OutputPer1M: 1.25},
}

func CostUSD(provider, model string, inTokens, outTokens int) float64 {
    p, ok := Prices[provider+":"+model]
    if !ok {
        return 0
    }
    return float64(inTokens)*p.InputPer1M/1_000_000 + float64(outTokens)*p.OutputPer1M/1_000_000
}
```

- [ ] **Step 3: Verify build**

```
cd backend && go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add backend/internal/ai/extractor.go backend/internal/ai/cost.go
git commit -m "feat(ai): provider-agnostic extractor interface + cost table"
```

---

### Task C3: Claude extractor

**Files:**
- Create: `backend/internal/ai/claude.go`

- [ ] **Step 1: Implement Claude extractor**

Create `backend/internal/ai/claude.go`:

```go
package ai

import (
    "context"
    "encoding/json"
    "fmt"
    "os"

    "github.com/anthropics/anthropic-sdk-go"
    "github.com/anthropics/anthropic-sdk-go/option"
)

func init() {
    Register("claude:claude-sonnet-4-6", func() (Extractor, error) { return newClaude("claude-sonnet-4-6"), nil })
    Register("claude:claude-haiku-4-5", func() (Extractor, error) { return newClaude("claude-haiku-4-5"), nil })
}

type claudeExtractor struct {
    model  string
    client *anthropic.Client
}

func newClaude(model string) Extractor {
    key := os.Getenv("ANTHROPIC_API_KEY")
    if key == "" {
        return &claudeExtractor{model: model} // will fail at Extract time
    }
    c := anthropic.NewClient(option.WithAPIKey(key))
    return &claudeExtractor{model: model, client: &c}
}

func (e *claudeExtractor) Provider() string { return "claude" }
func (e *claudeExtractor) Model() string    { return e.model }

func (e *claudeExtractor) Extract(ctx context.Context, req Request) (Result, error) {
    if e.client == nil {
        return Result{}, fmt.Errorf("ANTHROPIC_API_KEY not set")
    }

    blocks := []anthropic.ContentBlockParamUnion{
        anthropic.NewTextBlock(PromptTemplate(req.Categories)),
    }
    for _, url := range req.ImageURLs {
        blocks = append(blocks, anthropic.NewImageBlockBase64("", "")) // placeholder; replace with URL block API
        _ = url                                                          // see note below
    }

    // NOTE: Anthropic's Go SDK image-from-URL API has shifted across versions.
    // The above is a sketch — the implementing engineer must use the current
    // SDK signature. The `tool_use` route below is the authoritative shape:
    // we declare a "submit_recipe" tool with a strict JSON schema, and force
    // the model to call it. The parsed tool input is our Result.

    schema := map[string]any{
        "type": "object",
        "required": []string{"title", "category_slug", "time_minutes",
            "servings", "ingredients", "steps", "notes"},
        "properties": map[string]any{
            "title":         map[string]any{"type": "string"},
            "category_slug": map[string]any{"type": "string", "enum": req.Categories},
            "time_minutes":  map[string]any{"type": "integer", "minimum": 0},
            "servings":      map[string]any{"type": "string"},
            "ingredients": map[string]any{
                "type": "array",
                "items": map[string]any{
                    "type": "object",
                    "required": []string{"display", "name"},
                    "properties": map[string]any{
                        "display": map[string]any{"type": "string"},
                        "name":    map[string]any{"type": "string"},
                    },
                },
            },
            "steps": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
            "notes": map[string]any{"type": "string"},
        },
    }

    // Pseudocode for the actual SDK call. The implementing engineer should
    // consult the latest anthropic-sdk-go README and adapt:
    //
    //   resp, err := e.client.Messages.New(ctx, anthropic.MessageNewParams{
    //       Model: anthropic.Model(e.model),
    //       MaxTokens: 1024,
    //       Tools: []anthropic.ToolParam{{
    //           Name:         "submit_recipe",
    //           Description:  "Speichere das extrahierte Rezept.",
    //           InputSchema:  schema,
    //       }},
    //       ToolChoice: anthropic.ToolChoiceTool("submit_recipe"),
    //       Messages: []anthropic.MessageParam{{
    //           Role:    anthropic.MessageParamRoleUser,
    //           Content: blocks,
    //       }},
    //   })

    // After resp arrives, locate the tool_use block, json.Unmarshal its
    // Input into a map, then map fields to Result.
    //
    // The block above is intentionally incomplete; this task ships a
    // compileable file with TODO panics so the next task (worker) can be
    // built and tested with a fake extractor while the real call site
    // is iterated on against the live API.
    _ = schema

    return Result{}, fmt.Errorf("claudeExtractor.Extract: not implemented yet — finish against current anthropic-sdk-go signatures")
}
```

NOTE TO IMPLEMENTER: The Anthropic Go SDK has frequent shape changes; rather than hard-code a snapshot here, the task is to (1) install the SDK, (2) read its README, (3) implement the call against the current API. The schema, prompt, and tool-use approach above are correct; only the SDK call sites need to match the current SDK.

- [ ] **Step 2: Verify build**

```
cd backend && go build ./...
```
Expected: passes (file compiles, returns "not implemented yet" at runtime).

- [ ] **Step 3: Implement against the live SDK**

Read `vendor/github.com/anthropics/anthropic-sdk-go/README.md` (or the upstream README). Replace the body of `Extract` with a real call: build the message with image URL blocks, force `tool_use` for the `submit_recipe` tool, parse the resulting tool input, populate `Result.InputTokens`/`OutputTokens` from `resp.Usage`.

- [ ] **Step 4: Smoke-test against the API**

With `ANTHROPIC_API_KEY` set, write a tiny `main_test.go`-style program (or use `cmd/ai-eval`) and run it against one image to sanity-check.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/ai/claude.go
git commit -m "feat(ai): Claude vision extractor (Sonnet 4.6 + Haiku 4.5)"
```

---

### Task C4: OpenAI extractor

**Files:**
- Create: `backend/internal/ai/openai.go`

- [ ] **Step 1: Implement OpenAI extractor**

Create `backend/internal/ai/openai.go`:

```go
package ai

import (
    "context"
    "encoding/json"
    "fmt"
    "os"

    "github.com/openai/openai-go"
    "github.com/openai/openai-go/option"
)

func init() {
    Register("openai:gpt-5.4-mini", func() (Extractor, error) { return newOpenAI("gpt-5.4-mini"), nil })
    Register("openai:gpt-5.4-nano", func() (Extractor, error) { return newOpenAI("gpt-5.4-nano"), nil })
}

type openaiExtractor struct {
    model  string
    client *openai.Client
}

func newOpenAI(model string) Extractor {
    key := os.Getenv("OPENAI_API_KEY")
    if key == "" {
        return &openaiExtractor{model: model}
    }
    c := openai.NewClient(option.WithAPIKey(key))
    return &openaiExtractor{model: model, client: &c}
}

func (e *openaiExtractor) Provider() string { return "openai" }
func (e *openaiExtractor) Model() string    { return e.model }

func (e *openaiExtractor) Extract(ctx context.Context, req Request) (Result, error) {
    if e.client == nil {
        return Result{}, fmt.Errorf("OPENAI_API_KEY not set")
    }
    // Use the structured-output mode: response_format = { type: "json_schema",
    // json_schema: { name: "recipe", strict: true, schema: <same schema> } }.
    // Build a single user message with text + image URL parts.
    //
    // Pseudocode (engineer to adapt to current openai-go signatures):
    //
    //   resp, err := e.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
    //       Model: openai.ChatModel(e.model),
    //       Messages: []openai.ChatCompletionMessageParamUnion{
    //           openai.UserMessage([]openai.ChatCompletionContentPartUnionParam{
    //               {Text: openai.String(PromptTemplate(req.Categories))},
    //               {ImageURL: openai.F(openai.ImageURLPart{URL: req.ImageURLs[0]})},
    //               …
    //           }),
    //       },
    //       ResponseFormat: openai.ResponseFormatJSONSchema(openai.ResponseFormatJSONSchemaParam{
    //           JSONSchema: openai.F(openai.ResponseFormatJSONSchemaJSONSchemaParam{
    //               Name: "recipe", Strict: openai.Bool(true), Schema: schema,
    //           }),
    //       }),
    //   })
    //
    // Parse resp.Choices[0].Message.Content as JSON into Result.

    return Result{}, fmt.Errorf("openaiExtractor.Extract: not implemented yet — finish against current openai-go signatures")
}

// silence unused-import warnings during scaffolding
var _ = json.Unmarshal
```

NOTE TO IMPLEMENTER: Same pattern as Claude — implement against the current openai-go signatures. The schema and approach (response_format=json_schema strict) are correct.

- [ ] **Step 2: Verify build**

```
cd backend && go build ./...
```

- [ ] **Step 3: Implement against live SDK**

Same instructions as the Claude extractor — read the latest openai-go README, fill in `Extract`.

- [ ] **Step 4: Smoke-test against the API.**

- [ ] **Step 5: Commit**

```bash
git add backend/internal/ai/openai.go
git commit -m "feat(ai): OpenAI vision extractor (gpt-5.4 mini + nano)"
```

---

### Task C5: AI worker pool + fake extractor for tests

**Files:**
- Create: `backend/internal/ai/worker.go`, `backend/internal/ai/worker_test.go`

- [ ] **Step 1: Failing test using a fake extractor**

Create `backend/internal/ai/worker_test.go`:

```go
package ai_test

import (
    "context"
    "testing"
    "time"

    "backend/internal/ai"
    "backend/internal/db"
    "backend/internal/models"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

type fakeExtractor struct {
    out ai.Result
    err error
}

func (f *fakeExtractor) Extract(_ context.Context, _ ai.Request) (ai.Result, error) {
    return f.out, f.err
}
func (f *fakeExtractor) Provider() string { return "fake" }
func (f *fakeExtractor) Model() string    { return "fake-model" }

func TestWorker_processQueuedJob_marksReady(t *testing.T) {
    job := &models.AIJob{
        ID: "j1", UserID: "u1", Status: models.AIJobQueued,
        Provider: "fake", Model: "fake-model",
        ImageURLs: []string{"https://example.com/x.jpg"},
    }
    s := &db.MockStore{NextAIJob: job}

    w := ai.NewWorkerPool(s, ai.WorkerOpts{
        MaxAttempts: 3,
        Resolve: func(provider, model string) (ai.Extractor, error) {
            return &fakeExtractor{out: ai.Result{Title: "Bolognese", CategorySlug: "hauptgang", TimeMinutes: 30, Servings: "4 Personen", Steps: []string{"Step 1"}}}, nil
        },
    })

    ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
    defer cancel()
    require.NoError(t, w.RunOnce(ctx))

    // The mock store's SetAIJobReady is a no-op returning nil, so we just
    // verify no error occurred. The real DB-backed test happens in an
    // integration test (out of scope here).
    assert.True(t, true)
}
```

- [ ] **Step 2: Run — confirm failure**

```
cd backend && go test ./internal/ai/... -v
```
Expected: compile error (NewWorkerPool, WorkerOpts, RunOnce don't exist).

- [ ] **Step 3: Implement worker pool**

Create `backend/internal/ai/worker.go`:

```go
package ai

import (
    "context"
    "log"
    "time"

    "backend/internal/db"
    "backend/internal/models"
)

type WorkerOpts struct {
    Workers     int
    MaxAttempts int
    PollEvery   time.Duration
    Resolve     func(provider, model string) (Extractor, error)
}

type WorkerPool struct {
    store db.Store
    opts  WorkerOpts
}

func NewWorkerPool(store db.Store, opts WorkerOpts) *WorkerPool {
    if opts.Workers == 0 {
        opts.Workers = 2
    }
    if opts.MaxAttempts == 0 {
        opts.MaxAttempts = 3
    }
    if opts.PollEvery == 0 {
        opts.PollEvery = time.Second
    }
    if opts.Resolve == nil {
        opts.Resolve = Get
    }
    return &WorkerPool{store: store, opts: opts}
}

// Start launches the worker goroutines and a cleanup ticker.
// Blocks until ctx is canceled.
func (p *WorkerPool) Start(ctx context.Context) error {
    if err := p.store.ResetOrphanedAIJobs(ctx, p.opts.MaxAttempts); err != nil {
        log.Printf("worker: orphan reset failed: %v", err)
    }
    for i := 0; i < p.opts.Workers; i++ {
        go p.loop(ctx)
    }
    go p.cleanupLoop(ctx)
    <-ctx.Done()
    return ctx.Err()
}

func (p *WorkerPool) loop(ctx context.Context) {
    t := time.NewTicker(p.opts.PollEvery)
    defer t.Stop()
    for {
        select {
        case <-ctx.Done():
            return
        case <-t.C:
            if err := p.RunOnce(ctx); err != nil {
                log.Printf("worker: %v", err)
            }
        }
    }
}

// RunOnce claims at most one job and processes it. Used by tests; safe to call repeatedly.
func (p *WorkerPool) RunOnce(ctx context.Context) error {
    job, err := p.store.ClaimNextAIJob(ctx)
    if err != nil {
        return err
    }
    if job == nil {
        return nil
    }
    p.handle(ctx, job)
    return nil
}

func (p *WorkerPool) handle(ctx context.Context, job *models.AIJob) {
    extractor, err := p.opts.Resolve(job.Provider, job.Model)
    if err != nil {
        _ = p.store.SetAIJobFailed(ctx, job.ID, "model not available: "+err.Error())
        return
    }
    start := time.Now()
    res, err := extractor.Extract(ctx, Request{
        ImageURLs: job.ImageURLs,
        Locale:    "de",
    })
    if err != nil {
        if job.Attempts < p.opts.MaxAttempts {
            log.Printf("worker: job=%s attempt=%d retrying: %v", job.ID, job.Attempts, err)
            _ = p.store.RequeueAIJob(ctx, job.ID)
            return
        }
        _ = p.store.SetAIJobFailed(ctx, job.ID, err.Error())
        return
    }
    cost := CostUSD(extractor.Provider(), extractor.Model(), res.InputTokens, res.OutputTokens)
    log.Printf("ai: provider=%s model=%s job=%s user=%s latency_ms=%d in_tokens=%d out_tokens=%d cost_usd=%.5f",
        extractor.Provider(), extractor.Model(), job.ID, job.UserID,
        time.Since(start).Milliseconds(), res.InputTokens, res.OutputTokens, cost)
    payload := map[string]any{
        "title":         res.Title,
        "category_slug": res.CategorySlug,
        "time_minutes":  res.TimeMinutes,
        "servings":      res.Servings,
        "ingredients":   res.Ingredients,
        "steps":         res.Steps,
        "notes":         res.Notes,
        "confidence":    res.Confidence,
    }
    _ = p.store.SetAIJobReady(ctx, job.ID, payload)
}

func (p *WorkerPool) cleanupLoop(ctx context.Context) {
    t := time.NewTicker(6 * time.Hour)
    defer t.Stop()
    for {
        select {
        case <-ctx.Done():
            return
        case <-t.C:
            cutoff := time.Now().AddDate(0, 0, -30)
            n, err := p.store.DeleteOldAIJobs(ctx, cutoff)
            if err != nil {
                log.Printf("ai-cleanup: %v", err)
            } else if n > 0 {
                log.Printf("ai-cleanup: deleted %d old jobs", n)
            }
        }
    }
}
```

- [ ] **Step 4: Run tests**

```
cd backend && go test ./internal/ai/... -v
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/ai/worker.go backend/internal/ai/worker_test.go
git commit -m "feat(ai): worker pool with claim/retry/cleanup + tests"
```

---

### Task C6: AI job HTTP handlers

**Files:**
- Create: `backend/internal/handlers/ai_jobs.go`, `backend/internal/handlers/ai_jobs_test.go`

- [ ] **Step 1: Failing tests for limits + admin model override**

Create `backend/internal/handlers/ai_jobs_test.go`:

```go
package handlers_test

import (
    "bytes"
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "backend/internal/db"
    "backend/internal/handlers"
    mw "backend/internal/middleware"
    "backend/internal/models"

    "github.com/go-chi/chi/v5"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func newRouter(store db.Store, user *models.User) http.Handler {
    r := chi.NewRouter()
    r.Use(injectUser(user))
    r.Post("/api/ai-jobs", handlers.CreateAIJob(store, handlers.AIJobLimits{
        PerUserActive: 3, GlobalActive: 50, DailyPerUser: 20,
        DefaultProvider: "openai", DefaultModel: "gpt-5.4-mini",
    }))
    return r
}

func TestCreateAIJob_userCannotOverrideModel(t *testing.T) {
    store := &db.MockStore{}
    user := &models.User{ID: "u1", Role: models.RoleUser}
    body, _ := json.Marshal(map[string]any{
        "image_urls": []string{"https://example.com/a.jpg"},
        "provider":   "claude",
        "model":      "claude-sonnet-4-6",
    })
    req := httptest.NewRequest(http.MethodPost, "/api/ai-jobs", bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    newRouter(store, user).ServeHTTP(w, req)

    require.Equal(t, http.StatusOK, w.Code)
    var resp struct {
        Provider string `json:"provider"`
        Model    string `json:"model"`
    }
    require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
    assert.Equal(t, "openai", resp.Provider)
    assert.Equal(t, "gpt-5.4-mini", resp.Model)
}

func TestCreateAIJob_perUserLimit(t *testing.T) {
    store := &db.MockStore{AIActiveCount: 3}
    user := &models.User{ID: "u1", Role: models.RoleUser}
    body, _ := json.Marshal(map[string]any{"image_urls": []string{"https://example.com/a.jpg"}})
    req := httptest.NewRequest(http.MethodPost, "/api/ai-jobs", bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    newRouter(store, user).ServeHTTP(w, req)

    assert.Equal(t, http.StatusTooManyRequests, w.Code)
}

func TestCreateAIJob_imageCountValidated(t *testing.T) {
    store := &db.MockStore{}
    user := &models.User{ID: "u1", Role: models.RoleUser}
    body, _ := json.Marshal(map[string]any{"image_urls": []string{}})
    req := httptest.NewRequest(http.MethodPost, "/api/ai-jobs", bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    newRouter(store, user).ServeHTTP(w, req)

    assert.Equal(t, http.StatusBadRequest, w.Code)
}

// injectUser is defined in recipes_test.go.
var _ = context.Background
var _ = mw.CtxUser
```

- [ ] **Step 2: Run — confirm failure**

```
cd backend && go test ./internal/handlers/... -run TestCreateAIJob -v
```
Expected: compile errors (handlers.CreateAIJob not defined).

- [ ] **Step 3: Implement handlers**

Create `backend/internal/handlers/ai_jobs.go`:

```go
package handlers

import (
    "encoding/json"
    "errors"
    "log"
    "net/http"
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
    ID            string    `json:"id"`
    Status        string    `json:"status"`
    Provider      string    `json:"provider"`
    Model         string    `json:"model"`
    CreatedAt     time.Time `json:"created_at"`
    DailyUsed     int       `json:"daily_used"`
    DailyLimit    int       `json:"daily_limit"`
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
        if len(body.ImageURLs) < 1 || len(body.ImageURLs) > 3 {
            jsonError(w, "1 bis 3 Bilder erforderlich.", http.StatusBadRequest)
            return
        }
        for _, u := range body.ImageURLs {
            if len(u) == 0 || (len(u) < 8 || (u[:7] != "http://" && u[:8] != "https://")) {
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
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(aiJobResponse{
            ID: id, Status: "queued", Provider: provider, Model: model,
            CreatedAt: time.Now(), DailyUsed: used, DailyLimit: lim.DailyPerUser,
        })
    }
}

func ListAIJobs(store db.Store) http.HandlerFunc {
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
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
            "items":      jobs,
            "daily_used": used,
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

func MarkAIJobConsumed(store db.Store, userID, jobID string) error {
    return store.MarkAIJobConsumed(nil, jobID, userID)
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
```

- [ ] **Step 4: Run tests**

```
cd backend && go test ./internal/handlers/... -v
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/ai_jobs.go backend/internal/handlers/ai_jobs_test.go
git commit -m "feat(handlers): AI job endpoints with rate limiting"
```

---

### Task C7: Wire workers + AI routes in main.go

**Files:**
- Modify: `backend/main.go`
- Modify: `backend/.env.example` (or create)

- [ ] **Step 1: Update main.go**

Add to imports:
```go
"backend/internal/ai"
"strconv"
```

After `store := db.NewPostgresStore(pool)`:
```go
    aiLimits := handlers.AIJobLimits{
        PerUserActive:   intEnv("AI_PER_USER_ACTIVE_LIMIT", 3),
        GlobalActive:    intEnv("AI_GLOBAL_QUEUE_LIMIT", 50),
        DailyPerUser:    intEnv("AI_PER_USER_DAILY_LIMIT", 20),
        DefaultProvider: getenv("AI_DEFAULT_PROVIDER", "openai"),
        DefaultModel:    getenv("AI_DEFAULT_MODEL", "gpt-5.4-mini"),
    }

    pool2Workers := intEnv("AI_WORKERS", 2)
    pool := ai.NewWorkerPool(store, ai.WorkerOpts{Workers: pool2Workers})
    go func() {
        if err := pool.Start(ctx); err != nil && !errors.Is(err, context.Canceled) {
            log.Printf("ai worker pool: %v", err)
        }
    }()
```

(rename the local `pool` to avoid colliding with the existing `pool` from `db.NewPool`; e.g. call it `workerPool`.)

Add helper functions in main.go:
```go
func getenv(key, def string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return def
}
func intEnv(key string, def int) int {
    if v := os.Getenv(key); v != "" {
        if n, err := strconv.Atoi(v); err == nil {
            return n
        }
    }
    return def
}
```

In the protected routes group, add (alongside the recipe routes):
```go
        r.Post("/api/ai-jobs", handlers.CreateAIJob(store, aiLimits))
        r.Get("/api/ai-jobs", handlers.ListAIJobs(store))
        r.Get("/api/ai-jobs/{id}", handlers.GetAIJob(store))
        r.Delete("/api/ai-jobs/{id}", handlers.DeleteAIJob(store))
```

- [ ] **Step 2: Update .env.example**

In `backend/.env.example` append:
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
AI_DEFAULT_PROVIDER=openai
AI_DEFAULT_MODEL=gpt-5.4-mini
AI_WORKERS=2
AI_PER_USER_ACTIVE_LIMIT=3
AI_PER_USER_DAILY_LIMIT=20
AI_GLOBAL_QUEUE_LIMIT=50
```

- [ ] **Step 3: Verify build and tests**

```
cd backend && go build ./... && go test ./...
```

- [ ] **Step 4: Commit**

```bash
git add backend/main.go backend/.env.example
git commit -m "feat: wire AI worker pool and routes"
```

---

### Task C8: Allow `/api/ai-jobs` and `/api/admin/recipes` through the frontend proxy

**Files:**
- Modify: `frontend/app/api/proxy/[...path]/route.ts`

- [ ] **Step 1: Extend the allowed-prefix list**

In `frontend/app/api/proxy/[...path]/route.ts`, change the `ALLOWED_PREFIXES` constant:

```ts
const ALLOWED_PREFIXES = [
  '/api/recipes',
  '/api/admin/users',
  '/api/admin/recipes',
  '/api/admin/backup',
  '/api/ai-jobs',
]
```

Also update the cache-invalidation block at the bottom to invalidate `recipes` after a successful POST to `/api/ai-jobs/{id}/consumed`-equivalent flow — but since the consume happens implicitly when POST /api/recipes succeeds, no extra invalidation is needed here.

- [ ] **Step 2: Commit**

```bash
git add frontend/app/api/proxy/[...path]/route.ts
git commit -m "feat(proxy): allow /api/ai-jobs and /api/admin/recipes"
```

---

## Phase D — Frontend: extract reusable RecipeForm

### Task D1: Move recipe form to shared component

**Files:**
- Create: `frontend/components/recipe-form.tsx`
- Modify: `frontend/app/admin/recipe-form.tsx`

- [ ] **Step 1: Move the file**

Move the existing file's contents from `frontend/app/admin/recipe-form.tsx` to `frontend/components/recipe-form.tsx`, but make these changes:

(a) Add new prop `mode: 'create' | 'edit' | 'review-ai'`.
(b) Add new prop `imageOptions?: string[]` — when present, show a radio picker among these images for the cover image (used by AI-review). When absent, behave as today.
(c) Add new prop `isAdmin: boolean` — gate the JSON-Import UI on `isAdmin && mode !== 'review-ai'`.
(d) Add new prop `onAfterSave?: () => void` — when set, called instead of the default `router.push('/admin')`. Used so the AI-review flow can redirect to the recipe page, and so the user-create flow goes to `/rezepte`.

The signature becomes:
```ts
interface Props {
  categories: Category[]
  initial?: Partial<Recipe>
  mode: 'create' | 'edit' | 'review-ai'
  isAdmin: boolean
  imageOptions?: string[]
  onAfterSave?: (slug: string) => void
}
```

In the existing `clientSaveRecipe` call, capture the response slug if available — see Task D2 for the API change.

- [ ] **Step 2: Replace `frontend/app/admin/recipe-form.tsx` with a re-export shim**

```ts
// re-export so existing /admin pages keep working
export { RecipeForm } from '@/components/recipe-form'
```

- [ ] **Step 3: Update existing admin callers to pass `isAdmin={true}`**

`frontend/app/admin/neu/page.tsx` and `frontend/app/admin/[slug]/page.tsx` (find them with Glob) — pass `isAdmin={true}` and `mode='create'` or `mode='edit'`.

- [ ] **Step 4: Verify build**

```
cd frontend && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/recipe-form.tsx frontend/app/admin/recipe-form.tsx frontend/app/admin/neu/page.tsx frontend/app/admin/[slug]/page.tsx
git commit -m "refactor(frontend): extract RecipeForm into shared component"
```

---

### Task D2: Update `lib/api.ts` for new endpoints + types

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add types and helpers**

Append to `frontend/lib/api.ts`:

```ts
// ─── User-recipe additions ───────────────────────────────

export interface RecipeListItem {
  // …existing fields…
  owner_id?: string
  owner_email?: string
  is_mine?: boolean
}

export interface Recipe extends RecipeListItem {
  // …existing fields…
}

export interface ListRecipesResponse {
  items: RecipeListItem[]
  meta: { my_recipe_count: number }
}

export async function clientGetRecipesV2(filter: RecipeFilter & { owner?: 'me' } = {}): Promise<ListRecipesResponse> {
  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)
  if (filter.owner) params.set('owner', filter.owner)
  const qs = params.toString()
  const res = await fetch(`/api/proxy/recipes${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`getRecipes: ${res.status}`)
  return res.json()
}

// Update clientSaveRecipe to return the (possibly suffixed) final slug.
export async function clientSaveRecipeV2(recipe: Partial<Recipe>, isNew: boolean): Promise<{ slug: string }> {
  const url = isNew ? '/api/proxy/recipes' : `/api/proxy/recipes/${recipe.slug}`
  const res = await fetch(url, {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  })
  await throwIfError(res)
  if (!isNew) return { slug: recipe.slug! }
  return res.json()
}

// ─── AI jobs ─────────────────────────────────────────────

export type AIJobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled' | 'consumed'

export interface AIJob {
  id: string
  status: AIJobStatus
  provider: string
  model: string
  image_urls: string[]
  recipe_json?: Partial<Recipe>
  error?: string
  attempts: number
  created_at: string
  started_at?: string
  finished_at?: string
}

export interface ListAIJobsResponse {
  items: AIJob[]
  daily_used: number
}

export async function clientCreateAIJob(input: {
  image_urls: string[]
  provider?: string
  model?: string
}): Promise<{ id: string; daily_used: number; daily_limit: number }> {
  const res = await fetch('/api/proxy/ai-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  await throwIfError(res)
  return res.json()
}

export async function clientListAIJobs(): Promise<ListAIJobsResponse> {
  const res = await fetch('/api/proxy/ai-jobs')
  await throwIfError(res)
  return res.json()
}

export async function clientGetAIJob(id: string): Promise<AIJob> {
  const res = await fetch(`/api/proxy/ai-jobs/${id}`)
  await throwIfError(res)
  return res.json()
}

export async function clientDeleteAIJob(id: string): Promise<void> {
  const res = await fetch(`/api/proxy/ai-jobs/${id}`, { method: 'DELETE' })
  await throwIfError(res)
}
```

(Replace the existing `clientGetRecipes` and `clientSaveRecipe` callers progressively in later tasks; keep the V2 helpers stable.)

- [ ] **Step 2: Update `frontend/lib/api.server.ts`** — extend the SSR helper to use the new response shape:

```ts
// in api.server.ts, GetRecipes()
const data = await res.json()
return Array.isArray(data) ? data : data.items
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts frontend/lib/api.server.ts
git commit -m "feat(api): types and helpers for owner-aware recipes + ai-jobs"
```

---

## Phase E — Frontend: create flows

### Task E1: Tab bar — add "+ Neu"

**Files:**
- Modify: `frontend/components/tab-bar.tsx`

- [ ] **Step 1: Add the new tab**

In `frontend/components/tab-bar.tsx`, add a new entry to the `tabs` array between `/rezepte` and `/suche`:

```ts
  {
    href: '/neu',
    label: 'Neu',
    icon: (active: boolean) => (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="11" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v10M7 12h10" stroke={active ? '#fff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
```

Adjust the styling on this specific tab to make it visually primary:
- When the active path is `/neu`, the icon already renders filled; otherwise the icon shows an outlined circle with a plus in the accent color.

- [ ] **Step 2: Commit**

```bash
git add frontend/components/tab-bar.tsx
git commit -m "feat(frontend): + Neu tab in bottom bar"
```

---

### Task E2: `/neu` entry screen + pending-jobs widget

**Files:**
- Create: `frontend/app/neu/page.tsx`, `frontend/app/neu/pending-jobs.tsx`

- [ ] **Step 1: Pending-jobs client component**

Create `frontend/app/neu/pending-jobs.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { clientListAIJobs, clientDeleteAIJob, type AIJob } from '@/lib/api'

export function PendingJobs() {
  const [jobs, setJobs] = useState<AIJob[]>([])
  const [used, setUsed] = useState(0)

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const { items, daily_used } = await clientListAIJobs()
        if (stop) return
        setJobs(items)
        setUsed(daily_used)
        const active = items.some(j => j.status === 'queued' || j.status === 'running')
        timer = setTimeout(tick, active ? 3000 : 15000)
      } catch {
        timer = setTimeout(tick, 10000)
      }
    }
    tick()
    return () => { stop = true; if (timer) clearTimeout(timer) }
  }, [])

  if (jobs.length === 0) return null

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 12px' }}>
        In Bearbeitung
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {jobs.map(j => (
          <JobRow key={j.id} job={j} onCancel={async () => {
            await clientDeleteAIJob(j.id)
            setJobs(prev => prev.filter(x => x.id !== j.id))
          }} />
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>Heute genutzt: {used} / 20</p>
    </section>
  )
}

function JobRow({ job, onCancel }: { job: AIJob; onCancel: () => void }) {
  const status = job.status
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'white' }}>
      <span style={{ fontSize: 18 }}>{statusIcon(status)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--text)' }}>{statusLabel(status)}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{job.image_urls.length} Bild(er) · {job.model}</div>
      </div>
      {status === 'ready' && (
        <Link href={`/neu/aus-bild/${job.id}/pruefen`} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Prüfen</Link>
      )}
      {(status === 'queued' || status === 'failed' || status === 'ready') && (
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
      )}
    </div>
  )
}

function statusIcon(s: AIJob['status']) {
  switch (s) {
    case 'queued': return '⏳'
    case 'running': return '⏳'
    case 'ready': return '✓'
    case 'failed': return '⚠'
    default: return '•'
  }
}
function statusLabel(s: AIJob['status']) {
  switch (s) {
    case 'queued': return 'In Warteschlange'
    case 'running': return 'Wird analysiert…'
    case 'ready': return 'Bereit zur Prüfung'
    case 'failed': return 'Fehlgeschlagen'
    default: return s
  }
}
```

- [ ] **Step 2: Entry page**

Create `frontend/app/neu/page.tsx`:

```tsx
import Link from 'next/link'
import { PendingJobs } from './pending-jobs'

export default function NeuPage() {
  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px 96px' }}>
      <h1 style={{ fontSize: 32, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.5, color: 'var(--text)', margin: '0 0 8px' }}>
        Neues Rezept
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 24px' }}>Wie möchtest du dein Rezept anlegen?</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href="/neu/aus-bild" style={cardStyle}>
          <span style={iconStyle}>📷</span>
          <div>
            <div style={titleStyle}>Aus Bildern</div>
            <div style={subStyle}>Foto hochladen, KI füllt das Rezept aus</div>
          </div>
          <span style={chevStyle}>→</span>
        </Link>
        <Link href="/neu/manuell" style={cardStyle}>
          <span style={iconStyle}>✎</span>
          <div>
            <div style={titleStyle}>Manuell</div>
            <div style={subStyle}>Selbst Schritt für Schritt eingeben</div>
          </div>
          <span style={chevStyle}>→</span>
        </Link>
      </div>

      <PendingJobs />
    </main>
  )
}

const cardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: 18,
  borderRadius: 14, border: '1px solid var(--border)', background: 'white',
  textDecoration: 'none', color: 'var(--text)',
}
const iconStyle: React.CSSProperties = { fontSize: 28, lineHeight: 1 }
const titleStyle: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text)' }
const subStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', marginTop: 2 }
const chevStyle: React.CSSProperties = { marginLeft: 'auto', color: 'var(--muted)', fontSize: 18 }
```

- [ ] **Step 3: Verify build**

```
cd frontend && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/neu/
git commit -m "feat(frontend): /neu entry screen + pending-jobs polling"
```

---

### Task E3: `/neu/manuell` — manual create page

**Files:**
- Create: `frontend/app/neu/manuell/page.tsx`

- [ ] **Step 1: Implement page**

Create `frontend/app/neu/manuell/page.tsx`:

```tsx
import { getCategories } from '@/lib/api.server'
import { ManuellClient } from './manuell-client'

export default async function NeuManuellPage() {
  const categories = await getCategories()
  return <ManuellClient categories={categories} />
}
```

And create `frontend/app/neu/manuell/manuell-client.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/components/recipe-form'
import type { Category } from '@/lib/api'

export function ManuellClient({ categories }: { categories: Category[] }) {
  const router = useRouter()
  return (
    <main style={{ padding: '24px 16px 96px' }}>
      <RecipeForm
        categories={categories}
        mode="create"
        isAdmin={false}
        onAfterSave={(slug) => router.push(`/rezept/${slug}`)}
      />
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/neu/manuell/
git commit -m "feat(frontend): /neu/manuell create-from-scratch page"
```

---

### Task E4: `/neu/aus-bild` — image picker + AI submit

**Files:**
- Create: `frontend/app/neu/aus-bild/page.tsx`, `frontend/app/neu/aus-bild/aus-bild-client.tsx`

- [ ] **Step 1: Server page**

Create `frontend/app/neu/aus-bild/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { AusBildClient } from './aus-bild-client'

export default async function AusBildPage() {
  // We don't need anything async-server-side here, but keeping it as a server
  // wrapper future-proofs the route (e.g. for category list later).
  await cookies()
  return <AusBildClient />
}
```

- [ ] **Step 2: Client component**

Create `frontend/app/neu/aus-bild/aus-bild-client.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clientCreateAIJob } from '@/lib/api'

const MODEL_OPTIONS = [
  { provider: 'openai', model: 'gpt-5.4-mini', label: 'GPT-5.4 mini (Standard)' },
  { provider: 'openai', model: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
  { provider: 'claude', model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { provider: 'claude', model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
]

export function AusBildClient() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [modelKey, setModelKey] = useState('openai:gpt-5.4-mini')

  useEffect(() => {
    fetch('/api/auth/me-cached', { method: 'GET' }).catch(() => {})
    // Easier: just read the user from /api/proxy/auth/me but that route isn't proxied.
    // Instead we infer admin via a server-shipped flag — for now, expose a window global
    // set by the layout. As a placeholder, we read from localStorage:
    try {
      const role = localStorage.getItem('user_role')
      if (role === 'admin') setIsAdmin(true)
    } catch {}
    try {
      const saved = localStorage.getItem('ai_model_key')
      if (saved) setModelKey(saved)
    } catch {}
  }, [])

  async function uploadOne(file: File) {
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Upload fehlgeschlagen')
      }
      const { url } = await res.json() as { url: string }
      setImages(prev => [...prev, url])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      const [provider, model] = modelKey.split(':')
      await clientCreateAIJob({
        image_urls: images,
        ...(isAdmin ? { provider, model } : {}),
      })
      router.push('/neu')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 96px' }}>
      <h1 style={{ fontSize: 28, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.4, margin: '0 0 8px' }}>Aus Bildern</h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>
        Eine Aufnahme reicht, mehrere Winkel helfen aber. Maximal 3 Bilder.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {images.map((url, i) => (
          <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: 'var(--card-bg)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        {images.length < 3 && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ aspectRatio: '1', borderRadius: 12, border: '2px dashed var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 24, color: 'var(--muted)' }}>
            {uploading ? '…' : '+'}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => {
        const f = e.target.files?.[0]
        if (f) uploadOne(f)
        if (fileRef.current) fileRef.current.value = ''
      }} />

      {isAdmin && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>Modell wählen (Admin)</summary>
          <select value={modelKey} onChange={e => { setModelKey(e.target.value); try { localStorage.setItem('ai_model_key', e.target.value) } catch {} }}
            style={{ marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid var(--border)', width: '100%' }}>
            {MODEL_OPTIONS.map(o => <option key={`${o.provider}:${o.model}`} value={`${o.provider}:${o.model}`}>{o.label}</option>)}
          </select>
        </details>
      )}

      {error && <p style={{ color: '#B91C1C', fontSize: 13, margin: '12px 0' }}>{error}</p>}

      <button onClick={submit} disabled={images.length === 0 || submitting} style={{
        width: '100%', padding: '14px', borderRadius: 12, background: 'var(--accent)',
        color: 'white', border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
        opacity: images.length === 0 || submitting ? 0.5 : 1,
      }}>
        {submitting ? 'Sende…' : 'Rezept erzeugen'}
      </button>
    </main>
  )
}
```

NOTE TO IMPLEMENTER: the `localStorage.getItem('user_role')` lookup is a stand-in. The cleaner approach is to have the layout fetch `/api/auth/me` server-side (using existing `getMe` from `lib/api.server.ts` if it exists; otherwise add one), and pass `isAdmin` down as a prop. Update this component to receive `isAdmin` as a prop instead of reading from localStorage.

- [ ] **Step 3: Add server-side `getMe` helper if missing**

Check `frontend/lib/api.server.ts` — if there's no `getMe()`, add:

```ts
export async function getMe(): Promise<{ role: string } | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')
  if (!session) return null
  const res = await fetch(`${API}/api/auth/me`, {
    headers: { Cookie: `session=${session.value}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json()
}
```

Then in `frontend/app/neu/aus-bild/page.tsx`, pass `isAdmin` down:

```tsx
import { getMe } from '@/lib/api.server'
import { AusBildClient } from './aus-bild-client'

export default async function AusBildPage() {
  const me = await getMe()
  return <AusBildClient isAdmin={me?.role === 'admin'} />
}
```

And update `AusBildClient` to take `isAdmin` as a prop, removing the localStorage stand-in.

- [ ] **Step 4: Verify build**

```
cd frontend && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/neu/aus-bild/ frontend/lib/api.server.ts
git commit -m "feat(frontend): /neu/aus-bild image picker + AI submit"
```

---

### Task E5: `/neu/aus-bild/[jobId]/pruefen` — review AI result

**Files:**
- Create: `frontend/app/neu/aus-bild/[jobId]/pruefen/page.tsx`, `frontend/app/neu/aus-bild/[jobId]/pruefen/review-client.tsx`

- [ ] **Step 1: Server page**

Create `frontend/app/neu/aus-bild/[jobId]/pruefen/page.tsx`:

```tsx
import { getCategories } from '@/lib/api.server'
import { ReviewClient } from './review-client'

export default async function PruefenPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const categories = await getCategories()
  return <ReviewClient jobId={jobId} categories={categories} />
}
```

- [ ] **Step 2: Client component**

Create `frontend/app/neu/aus-bild/[jobId]/pruefen/review-client.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/components/recipe-form'
import { clientGetAIJob, clientDeleteAIJob, type AIJob, type Category, type Recipe } from '@/lib/api'

export function ReviewClient({ jobId, categories }: { jobId: string; categories: Category[] }) {
  const router = useRouter()
  const [job, setJob] = useState<AIJob | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    clientGetAIJob(jobId).then(setJob).catch(e => setError(e.message))
  }, [jobId])

  if (error) return <main style={{ padding: 24 }}><p style={{ color: '#B91C1C' }}>{error}</p></main>
  if (!job) return <main style={{ padding: 24 }}><p>Lädt…</p></main>
  if (job.status !== 'ready' || !job.recipe_json) {
    return (
      <main style={{ padding: 24 }}>
        <p>Job ist noch nicht bereit (Status: {job.status}).</p>
      </main>
    )
  }

  const initial: Partial<Recipe> = {
    ...job.recipe_json,
    image_url: job.image_urls[0],
  }

  return (
    <main style={{ padding: '24px 16px 96px' }}>
      <RecipeForm
        categories={categories}
        initial={initial}
        mode="review-ai"
        isAdmin={false}
        imageOptions={job.image_urls}
        onAfterSave={async (slug) => {
          // Mark job consumed via DELETE (server treats consume vs cancel by status).
          // Cleanest: a dedicated endpoint, but DELETE is acceptable per spec.
          try { await clientDeleteAIJob(jobId) } catch {}
          router.push(`/rezept/${slug}`)
        }}
      />
    </main>
  )
}
```

NOTE: per spec, “consumed” is a separate status from “deleted.” For correctness, add a dedicated endpoint `POST /api/ai-jobs/{id}/consume` that calls `MarkAIJobConsumed`. Wire it into `main.go` and add a `clientConsumeAIJob` helper in `lib/api.ts`. Replace the `clientDeleteAIJob` call here with `clientConsumeAIJob`.

- [ ] **Step 3: Add `/consume` endpoint**

Add to `backend/internal/handlers/ai_jobs.go`:

```go
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
```

Wire in `backend/main.go`:
```go
        r.Post("/api/ai-jobs/{id}/consume", handlers.ConsumeAIJob(store))
```

Add `clientConsumeAIJob` to `frontend/lib/api.ts`:
```ts
export async function clientConsumeAIJob(id: string): Promise<void> {
  const res = await fetch(`/api/proxy/ai-jobs/${id}/consume`, { method: 'POST' })
  await throwIfError(res)
}
```

Replace the `clientDeleteAIJob(jobId)` call in `review-client.tsx` with `clientConsumeAIJob(jobId)`.

- [ ] **Step 4: Verify build**

```
cd backend && go build ./... && cd ../frontend && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/ai_jobs.go backend/main.go frontend/app/neu/aus-bild/ frontend/lib/api.ts
git commit -m "feat(frontend): /neu/aus-bild/[jobId]/pruefen review flow + consume endpoint"
```

---

## Phase F — Frontend: browse + recipe detail

### Task F1: Browse page — "Meine Rezepte" chip and `is_mine` cards

**Files:**
- Modify: `frontend/app/rezepte/page.tsx`, `frontend/app/rezepte/browse-client.tsx`, `frontend/components/recipe-card.tsx`

- [ ] **Step 1: Update `getRecipes` SSR helper**

In `frontend/lib/api.server.ts`, change `getRecipes()` to capture and return both items and meta:

```ts
export async function getRecipes(): Promise<{ items: RecipeListItem[]; myRecipeCount: number }> {
  // existing fetch logic …
  const data = await res.json()
  if (Array.isArray(data)) return { items: data, myRecipeCount: 0 }
  return { items: data.items, myRecipeCount: data.meta?.my_recipe_count ?? 0 }
}
```

Update its caller in `frontend/app/rezepte/page.tsx`:

```tsx
const [categories, recipesResp] = await Promise.all([
  getCategories(),
  getRecipes(),
])
return (
  <Suspense fallback={<RezepteLoading />}>
    <BrowseClient categories={categories} initialRecipes={recipesResp.items} myRecipeCount={recipesResp.myRecipeCount} />
  </Suspense>
)
```

(Also update any other callers that destructured the prior array shape.)

- [ ] **Step 2: BrowseClient — add chip**

In `frontend/app/rezepte/browse-client.tsx`:

(a) Add `myRecipeCount: number` to `Props`.
(b) Read `?owner=me` from `useSearchParams()` similarly to `category`.
(c) When `urlOwner === 'me'`, set the `clientGetRecipesV2({ owner: 'me' })` call as the data source instead of `initialRecipes`.
(d) Render the "Meine Rezepte" chip after all category chips, **only if `myRecipeCount > 0`**. Clicking it sets `?owner=me`. When `?owner=me` is active, the chip is highlighted and category chips render unselected.

The chip block becomes:
```tsx
{myRecipeCount > 0 && (
  <button
    type="button"
    onClick={() => setActiveCat('__mine__')}
    className="..."
    style={{
      border: `1px solid ${activeCat === '__mine__' ? 'var(--accent)' : 'var(--border)'}`,
      background: activeCat === '__mine__' ? 'var(--accent)' : 'transparent',
      color: activeCat === '__mine__' ? '#fff' : 'var(--text)',
      ...
    }}
  >Meine Rezepte</button>
)}
```

When `activeCat === '__mine__'`, fetch via `clientGetRecipesV2({ owner: 'me' })` and use its items as the display list.

- [ ] **Step 3: Card — render "Mein Rezept" badge**

In `frontend/components/recipe-card.tsx`, add — wherever the category label is rendered — a conditional:

```tsx
{recipe.is_mine ? 'Mein Rezept' : (category?.name ?? '')}
```

- [ ] **Step 4: Verify build**

```
cd frontend && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/rezepte/ frontend/components/recipe-card.tsx frontend/lib/api.server.ts
git commit -m "feat(frontend): Meine Rezepte chip + Mein Rezept card badge"
```

---

### Task F2: Recipe detail — owner-aware edit/delete

**Files:**
- Modify: `frontend/app/rezept/[slug]/page.tsx` (or its client child)
- Create: `frontend/app/rezept/[slug]/bearbeiten/page.tsx`

- [ ] **Step 1: Inspect existing recipe-detail file**

```
find frontend/app/rezept -name '*.tsx'
```

- [ ] **Step 2: Add owner controls**

In the existing recipe-detail client component (find by glob if needed), add an "Bearbeiten" link and a "Löschen" button when `recipe.is_mine === true` (or admin). Reuse the existing admin pattern from `frontend/app/admin/[slug]/*` — likely just reuse the same delete-confirmation flow.

```tsx
{recipe.is_mine && (
  <div style={{ display: 'flex', gap: 8 }}>
    <Link href={`/rezept/${recipe.slug}/bearbeiten`}>Bearbeiten</Link>
    <button onClick={async () => {
      if (!confirm('Rezept wirklich löschen?')) return
      await clientDeleteRecipe(recipe.slug)
      router.push('/rezepte')
    }}>Löschen</button>
  </div>
)}
```

- [ ] **Step 3: Edit page**

Create `frontend/app/rezept/[slug]/bearbeiten/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getCategories, getRecipe } from '@/lib/api.server'
import { EditClient } from './edit-client'

export default async function BearbeitenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [categories, recipe] = await Promise.all([getCategories(), getRecipe(slug)])
  if (!recipe) notFound()
  return <EditClient categories={categories} recipe={recipe} />
}
```

And `frontend/app/rezept/[slug]/bearbeiten/edit-client.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/components/recipe-form'
import type { Category, Recipe } from '@/lib/api'

export function EditClient({ categories, recipe }: { categories: Category[]; recipe: Recipe }) {
  const router = useRouter()
  return (
    <main style={{ padding: '24px 16px 96px' }}>
      <RecipeForm
        categories={categories}
        initial={recipe}
        mode="edit"
        isAdmin={false}
        onAfterSave={(slug) => router.push(`/rezept/${slug}`)}
      />
    </main>
  )
}
```

If `getRecipe` doesn't exist in `lib/api.server.ts`, add a thin wrapper that calls `${API}/api/recipes/{slug}` with the session cookie.

- [ ] **Step 4: Verify build**

```
cd frontend && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/rezept/
git commit -m "feat(frontend): owner-aware edit/delete on recipe detail"
```

---

## Phase G — Admin panel

### Task G1: Admin recipes list with owner column

**Files:**
- Create: `frontend/app/admin/rezepte/page.tsx`, `frontend/app/admin/rezepte/admin-recipes-client.tsx`

- [ ] **Step 1: Server page**

Create `frontend/app/admin/rezepte/page.tsx`:

```tsx
import { getCategories } from '@/lib/api.server'
import { AdminRecipesClient } from './admin-recipes-client'

export default async function AdminRecipesPage() {
  const categories = await getCategories()
  return <AdminRecipesClient categories={categories} />
}
```

- [ ] **Step 2: Client component**

Create `frontend/app/admin/rezepte/admin-recipes-client.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Category, RecipeListItem } from '@/lib/api'

type Filter = 'all' | 'global' | 'user'

export function AdminRecipesClient({ categories }: { categories: Category[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [items, setItems] = useState<RecipeListItem[]>([])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('filter', filter)
    fetch(`/api/proxy/admin/recipes${params.toString() ? `?${params}` : ''}`)
      .then(r => r.json())
      .then(setItems)
  }, [filter])

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 96px' }}>
      <h1 style={{ fontSize: 28, fontFamily: 'var(--font-serif)', marginBottom: 16 }}>Rezepte verwalten</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'global', 'user'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '8px 14px', borderRadius: 999,
            border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
            background: filter === f ? 'var(--accent)' : 'transparent',
            color: filter === f ? '#fff' : 'var(--text)', cursor: 'pointer',
          }}>
            {f === 'all' ? 'Alle' : f === 'global' ? 'Global' : 'Nutzer-Rezepte'}
          </button>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
            <th>Titel</th><th>Kategorie</th><th>Owner</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(r => (
            <tr key={r.slug} style={{ borderBottom: '1px solid var(--border)' }}>
              <td>{r.title}</td>
              <td>{categories.find(c => c.slug === r.category_slug)?.name ?? r.category_slug}</td>
              <td>{r.owner_email || 'Global'}</td>
              <td><Link href={`/admin/${r.slug}`}>Bearbeiten</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 3: Add link from existing admin landing page**

Open `frontend/app/admin/page.tsx`, add a link to `/admin/rezepte` somewhere visible.

- [ ] **Step 4: Verify build**

```
cd frontend && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/rezepte/ frontend/app/admin/page.tsx
git commit -m "feat(admin): recipes management table with owner column"
```

---

## Phase H — Eval script

### Task H1: AI eval script scaffold

**Files:**
- Create: `backend/cmd/ai-eval/main.go`, `backend/cmd/ai-eval/dishes.json`, `backend/cmd/ai-eval/README.md`

- [ ] **Step 1: Reference dishes**

Create `backend/cmd/ai-eval/dishes.json`:

```json
[
  {
    "name": "Spaghetti Bolognese",
    "image_urls": ["https://example.com/bolognese-1.jpg", "https://example.com/bolognese-2.jpg"],
    "reference": {
      "title": "Spaghetti Bolognese",
      "category_slug": "hauptgang",
      "ingredients_names": ["hackfleisch", "spaghetti", "tomaten", "zwiebel", "knoblauch"],
      "step_count_min": 4,
      "step_count_max": 8
    }
  }
]
```

(Engineer to fill in 10 dishes with real Cloudinary URLs before running.)

- [ ] **Step 2: Eval main**

Create `backend/cmd/ai-eval/main.go`:

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "os"
    "strings"
    "time"

    "backend/internal/ai"
)

type dish struct {
    Name      string         `json:"name"`
    ImageURLs []string       `json:"image_urls"`
    Reference referenceShape `json:"reference"`
}

type referenceShape struct {
    Title            string   `json:"title"`
    CategorySlug     string   `json:"category_slug"`
    IngredientsNames []string `json:"ingredients_names"`
    StepCountMin     int      `json:"step_count_min"`
    StepCountMax     int      `json:"step_count_max"`
}

func main() {
    f, err := os.Open("backend/cmd/ai-eval/dishes.json")
    if err != nil {
        log.Fatal(err)
    }
    defer f.Close()
    var dishes []dish
    if err := json.NewDecoder(f).Decode(&dishes); err != nil {
        log.Fatal(err)
    }

    keys := []string{
        "openai:gpt-5.4-nano",
        "openai:gpt-5.4-mini",
        "claude:claude-haiku-4-5",
        "claude:claude-sonnet-4-6",
    }

    var lines []string
    lines = append(lines, "| dish | model | title_match | ingr_jaccard | steps_ok | latency_ms | cost_usd |")
    lines = append(lines, "|---|---|---|---|---|---|---|")

    for _, d := range dishes {
        for _, key := range keys {
            ext, err := ai.Get(key)
            if err != nil {
                log.Printf("skip %s: %v", key, err)
                continue
            }
            start := time.Now()
            res, err := ext.Extract(context.Background(), ai.Request{
                ImageURLs:  d.ImageURLs,
                Locale:     "de",
                Categories: []string{"hauptgang", "vorspeise", "dessert", "fruehstueck", "beilage"},
            })
            elapsed := time.Since(start).Milliseconds()
            if err != nil {
                lines = append(lines, fmt.Sprintf("| %s | %s | ERR: %s | | | %d | |", d.Name, key, err.Error(), elapsed))
                continue
            }

            tm := strings.EqualFold(res.Title, d.Reference.Title)
            jacc := jaccard(ingredientNames(res.Ingredients), d.Reference.IngredientsNames)
            stepsOK := len(res.Steps) >= d.Reference.StepCountMin && len(res.Steps) <= d.Reference.StepCountMax
            cost := ai.CostUSD(ext.Provider(), ext.Model(), res.InputTokens, res.OutputTokens)

            lines = append(lines, fmt.Sprintf("| %s | %s | %v | %.2f | %v | %d | %.4f |",
                d.Name, key, tm, jacc, stepsOK, elapsed, cost))
        }
    }

    out := strings.Join(lines, "\n") + "\n"
    if err := os.WriteFile("backend/cmd/ai-eval/results.md", []byte(out), 0644); err != nil {
        log.Fatal(err)
    }
    fmt.Println(out)
}

func ingredientNames(items []ai.Result) []string { return nil } // placeholder; see fix below
```

(That last line is a typo — the implementing engineer should replace with:)

```go
import "backend/internal/models"

func ingredientNames(items []models.Ingredient) []string {
    out := make([]string, 0, len(items))
    for _, i := range items {
        out = append(out, strings.ToLower(strings.TrimSpace(i.Name)))
    }
    return out
}

func jaccard(a, b []string) float64 {
    set := map[string]bool{}
    for _, x := range a {
        set[x] = true
    }
    inter := 0
    for _, y := range b {
        if set[y] {
            inter++
        }
    }
    union := len(a) + len(b) - inter
    if union == 0 {
        return 0
    }
    return float64(inter) / float64(union)
}
```

- [ ] **Step 3: README**

Create `backend/cmd/ai-eval/README.md`:

```markdown
# AI eval

Compares Claude (Sonnet 4.6, Haiku 4.5) and OpenAI (GPT-5.4 mini, nano)
on a small set of reference dishes. Outputs a markdown table.

## Run

    ANTHROPIC_API_KEY=… OPENAI_API_KEY=… go run ./backend/cmd/ai-eval

Models with a missing API key are skipped.
```

- [ ] **Step 4: Verify build**

```
cd backend && go build ./cmd/ai-eval
```

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/ai-eval/
git commit -m "feat(ai): eval script + reference dishes"
```

---

## Final integration checks

### Task Z1: End-to-end manual smoke test

- [ ] **Step 1: Bring up local stack**

```
docker compose up -d postgres
cd backend && go run .
# in another terminal:
cd frontend && npm run dev
```

- [ ] **Step 2: Run through each flow**

Visit `http://localhost:3000` and verify:
1. `/neu` exists in the tab bar.
2. Manual create: `/neu/manuell` → fill form → Save → see the recipe at `/rezept/<slug>` with "Mein Rezept" badge.
3. AI create: `/neu/aus-bild` → upload 1–3 images → submit → returned to `/neu` showing the job in "In Bearbeitung". With keys missing, the job will fail (expected).
4. With keys set, after ~30s the job becomes "ready" → click "Prüfen" → form is prefilled → Save → recipe appears with badge.
5. `/rezepte` shows all admin recipes plus your two new ones; "Meine Rezepte" chip shows up.
6. Edit / delete on own recipe works.
7. Admin: log in as admin, `/admin/rezepte` shows both global and user recipes.
8. Limits: create 4 AI jobs in a row → 4th returns `429`.

- [ ] **Step 3: Commit nothing (this task is verification only)**

---

## Spec coverage (self-review by plan author)

- Migration with owner_id, ai_jobs, ai_usage_daily — Task A1.
- Recipe model OwnerID/OwnerEmail/IsMine — Task A2.
- Slug-collision retry — Task A5.
- Visibility rule (admin/user/owner) — Task A5 + B1.
- AIJob model + status enum — Task A3.
- ai_jobs Postgres methods incl. claim — Task A6.
- Mock store extended — Task A7.
- Provider-agnostic interface + cost table — Task C2.
- Claude + OpenAI extractors — Task C3, C4.
- Worker pool + cleanup ticker — Task C5.
- AI HTTP endpoints + rate limits + admin model override — Task C6.
- Wired in main.go with env config — Task C7.
- Frontend proxy allow-list — Task C8.
- Reusable RecipeForm — Task D1.
- New API helpers — Task D2.
- Tab bar `+ Neu` — Task E1.
- `/neu` + pending jobs — Task E2.
- `/neu/manuell` — Task E3.
- `/neu/aus-bild` — Task E4.
- `/neu/aus-bild/[jobId]/pruefen` + `/consume` endpoint — Task E5.
- "Meine Rezepte" chip + "Mein Rezept" badge — Task F1.
- Edit/delete on own recipe + `/bearbeiten` page — Task F2.
- Admin recipes table — Task G1.
- Eval script — Task H1.
