# User-Created Recipes (manual + AI-from-image)

**Date:** 2026-05-10
**Status:** Design — ready for implementation planning

## Goal

Let regular (non-admin) users create their own recipes inside the app. Two creation modes:

1. **Manual** — the existing recipe form, used by the user themselves.
2. **From image(s)** — user uploads 1–3 photos; a vision LLM extracts a structured German recipe; user reviews and saves.

User recipes are **private** to their owner: only that user (and admins, in the admin panel) can see them. The browse page (`/rezepte`) shows admin/global recipes mixed with the current user's own. A "Meine Rezepte" filter chip appears once the user has at least one own recipe.

## Non-goals

- Sharing user recipes between users.
- Promoting a user recipe to global (admin button — possible later, not now).
- Importing recipes from URLs.
- Multiple cover images / recipe galleries.
- Free-form tags or categories.
- Real-time push for AI job completion (we poll).

## High-level architecture

```
┌─ frontend ──────────────────────────────────────────────┐
│  Tab bar: Entdecken · Rezepte · ⊕ Neu · Suchen           │
│  /neu                → choose Manuell / Aus Bild         │
│  /neu/manuell        → recipe form                       │
│  /neu/aus-bild       → image picker + AI submit          │
│  /neu/aus-bild/[jobId]/pruefen → review AI result        │
│  /rezepte            → adds "Meine Rezepte" chip         │
│  /rezept/[slug]      → owner-aware Bearbeiten / Löschen  │
│  /rezept/[slug]/bearbeiten → recipe form (edit mode)     │
│  /admin/rezepte      → admin sees ALL recipes            │
└──────────────────────────────────────────────────────────┘
                          │ HTTP (session cookie)
┌─ backend (Go/chi) ──────────────────────────────────────┐
│  /api/recipes (list, owner-aware)                        │
│  /api/recipes/{slug} (get/put/delete, owner-aware)       │
│  /api/ai-jobs (create/list/get/delete)                   │
│  AI worker pool — 2 goroutines inside backend process    │
│  Provider interface → claude.go, openai.go               │
└──────────────────────────────────────────────────────────┘
                          │
                ┌─ Postgres ────────────┐
                │  recipes (+owner_id)  │
                │  ai_jobs              │
                │  ai_usage_daily       │
                └───────────────────────┘
```

## Data model

### Migration `0004_user_recipes.sql`

```sql
-- +goose Up
ALTER TABLE recipes ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX idx_recipes_owner ON recipes(owner_id);

CREATE TABLE ai_jobs (
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
CREATE INDEX idx_ai_jobs_user_status ON ai_jobs(user_id, status);
CREATE INDEX idx_ai_jobs_status_created ON ai_jobs(status, created_at);

CREATE TABLE ai_usage_daily (
  user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      DATE        NOT NULL,
  count    INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- +goose Down
DROP TABLE IF EXISTS ai_usage_daily;
DROP TABLE IF EXISTS ai_jobs;
DROP INDEX IF EXISTS idx_recipes_owner;
ALTER TABLE recipes DROP COLUMN IF EXISTS owner_id;
```

`owner_id IS NULL` means a global (admin-published) recipe — preserves backward compatibility with all existing data.

### Slug strategy

Slugs remain globally unique (the existing primary key). On insert, if the user-provided slug collides, the server appends `-2`, `-3`, … up to `-99` and retries; if that range is exhausted it errors. Keeps existing public URLs (`/rezept/spaghetti-bolognese`) untouched and avoids any URL routing change.

### Visibility rule (read queries)

- Non-admin: `WHERE owner_id IS NULL OR owner_id = $me`
- Admin browsing public pages: same as a normal user (matches their own browse experience).
- Admin in the admin panel: no owner filter.
- `?owner=me`: `WHERE owner_id = $me`.

### Recipe model additions

```go
// internal/models/recipe.go
type Recipe struct {
    // existing fields …
    OwnerID    *string `json:"owner_id,omitempty"`     // null = global
    OwnerEmail string  `json:"owner_email,omitempty"`  // joined; admin views only
    IsMine     bool    `json:"is_mine,omitempty"`      // server-derived for caller
}
```

`IsMine` is **set by the server in the response, not stored** — it's `true` when the row's `OwnerID` matches the caller's user id. The handler computes it before serialization on every list and detail response. `OwnerEmail` is joined from `users` only in admin views.

## AI pipeline

### Provider interface (`internal/ai/extractor.go`)

```go
type Request struct {
    ImageURLs  []string  // 1–3 https URLs
    Locale     string    // "de"
    Categories []string  // valid category slugs
}

type Result struct {
    Title        string       `json:"title"`
    CategorySlug string       `json:"category_slug"`
    TimeMinutes  int          `json:"time_minutes"`
    Servings     string       `json:"servings"`
    Ingredients  []Ingredient `json:"ingredients"`
    Steps        []string     `json:"steps"`
    Notes        string       `json:"notes"`
    Confidence   float64      `json:"confidence,omitempty"` // UI hint only
}

type Extractor interface {
    Extract(ctx context.Context, req Request) (Result, error)
    Provider() string
    Model() string
}

var Registry = map[string]func() Extractor{
    "claude:claude-sonnet-4-6":   newClaudeSonnet,
    "claude:claude-haiku-4-5":    newClaudeHaiku,
    "openai:gpt-5.4-mini":        newOpenAIMini,
    "openai:gpt-5.4-nano":        newOpenAINano,
}

const DefaultProviderModel = "openai:gpt-5.4-mini"
```

Two implementations:
- `claude.go` — Anthropic SDK with tool-use mode for strict JSON output.
- `openai.go` — OpenAI SDK with `response_format=json_schema`.

Both use the same German prompt and produce a `Result` whose shape matches the schema enforced via the SDK's structured-output mode.

### Prompt template (German, both providers)

> Du bist ein Rezept-Extraktor. Analysiere die Bilder und schreibe ein vollständiges deutsches Rezept im JSON-Format. Kategorien dürfen NUR aus dieser Liste stammen: [hauptgang, vorspeise, …]. Bei mehreren Bildern: gehe davon aus, dass sie dasselbe Gericht aus verschiedenen Winkeln zeigen. Schätze Mengen für 4 Personen, sofern nicht anders erkennbar. Antworte ausschließlich mit dem JSON-Schema.

The category list is injected at runtime so it stays in sync with the `categories` table.

### Worker pool (`internal/ai/worker.go`)

- `RunWorkers(ctx, store, registry, n)` spawns `n` goroutines (default 2 via `AI_WORKERS` env var).
- Each loops:
  1. `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1` to claim the oldest `queued` row.
  2. Set `status='running'`, increment `attempts`, set `started_at`.
  3. Resolve `Extractor` from `Registry` keyed by `provider:model`.
  4. Call `Extract`. On success: set `status='ready'`, store `recipe_json`, set `finished_at`.
  5. On error: if `attempts < 3`, set back to `queued` with backoff; else set `status='failed'` with `error`.
- Polling interval: 1 s when idle.
- **Startup recovery:** at boot, reset orphaned `running` rows back to `queued` if `attempts < 3`, else `failed`.

### Job lifecycle

```
queued ──► running ──► ready ─────► consumed   (user saved the recipe)
                  │                  ▲
                  └──► failed        │
                  └──► cancelled (user deletes pending job)

any terminal state (ready/consumed/failed/cancelled) ──TTL──► auto-deleted after 30 days
```

The 30-day cleanup is a small `go` ticker started alongside the worker pool. Applies to every row whose `finished_at < now() - 30 days` (or `created_at` for `cancelled` rows that never started).

### API endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/ai-jobs` | Body: `{image_urls, provider?, model?}`. Validates limits + image count 1–3. Admin: any registered model. Non-admin: forced to `DefaultProviderModel`. Returns `{id, status: 'queued'}`. |
| GET | `/api/ai-jobs` | List the caller's jobs from the last 24 h, latest first. |
| GET | `/api/ai-jobs/{id}` | Single job. Includes `recipe_json` when `status='ready'`. 404 for jobs not owned by caller. |
| DELETE | `/api/ai-jobs/{id}` | Allowed when `status IN ('queued','ready')`. Deletes the row. |

### Rate limits / cost ceilings (server-side, enforced on POST)

All checks happen in a **single transaction** alongside the job insert, so two simultaneous requests can't both pass:

1. Reject if `count(ai_jobs WHERE user_id=$me AND status IN ('queued','running')) ≥ 3`.
2. Reject if global `count(ai_jobs WHERE status IN ('queued','running')) ≥ 50`.
3. Read `ai_usage_daily(user_id, day=current UTC date)` — reject if `count ≥ 20`. Otherwise upsert with `count = count + 1`.
4. Insert the `ai_jobs` row.
5. Worker concurrency: `AI_WORKERS=2` (env-tunable).

The daily counter is keyed by **UTC date** (cheap, no per-user timezone tracking). 429 responses include `{"error": "...", "retry_after_seconds": <n>}`.

### Logging

Each successful extraction logs:
`provider=… model=… job=<id> user=<email> latency_ms=… in_tokens=… out_tokens=… cost_usd=…`

Cost is computed from a small in-code price table per model. Lets you build a cost dashboard later and feeds the eval script.

## UX / IA (mobile-first, with desktop)

### Tab bar

`Entdecken · Rezepte · ⊕ Neu · Suchen` — visible to all logged-in users. The `⊕` is a filled accent-color circle so it reads as the primary CTA.

### `/neu` (entry screen)

```
┌──────────────────────────────────────┐
│  ← Neues Rezept                       │
│                                       │
│  Wie möchtest du dein Rezept anlegen?│
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  📷  Aus Bildern                │ │
│  │  Foto hochladen, KI füllt aus   │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │  ✎  Manuell                     │ │
│  │  Selbst Schritt für Schritt     │ │
│  └─────────────────────────────────┘ │
│                                       │
│  ────────── In Bearbeitung ────────  │
│  ⏳ Pasta-Foto … wird analysiert     │
│  ✓  Gnocchi-Foto … bereit  [Prüfen]  │
│  ⚠  Auflauf … fehlgeschlagen  [✕]    │
└──────────────────────────────────────┘
```

The "In Bearbeitung" list polls `GET /api/ai-jobs` every 3 s while the page is open; stops polling when no `queued`/`running` jobs remain. Hidden entirely when the user has no jobs.

### `/neu/aus-bild`

- Reuses the existing `/api/upload` Cloudinary endpoint per image (1–3, drag-and-drop on desktop, native file input that opens the camera roll on mobile).
- Helper text: "Eine Aufnahme reicht, mehrere Winkel helfen aber."
- **Admin-only** `<details>` panel: "Modell wählen" with the 4-model picker (Sonnet 4.6 / Haiku 4.5 / GPT-5.4 mini / GPT-5.4 nano), default GPT-5.4 mini, persisted in `localStorage`.
- "Rezept erzeugen" → `POST /api/ai-jobs` → redirect to `/neu` (which shows the new job in "In Bearbeitung").
- Inline daily-quota indicator: "Heute verbleibend: 18 / 20".

### `/neu/aus-bild/[jobId]/pruefen`

- Reuses the existing `RecipeForm` component (extracted from `/admin/recipe-form.tsx`, parameterized).
- Pre-filled with the job's `recipe_json`.
- The 1–3 uploaded images become the cover-image picker (radio).
- Buttons: **Speichern** (POST /api/recipes; marks job `consumed`) / **Verwerfen** (DELETE /api/ai-jobs/{id}).

### `/neu/manuell`

- Same `RecipeForm`, `mode='create'`. Hides the JSON-Import panel for non-admins. Saves with `owner_id = current user`.

### `/rezepte` browse

- Category chip strip gains "Meine Rezepte" as the **last** chip, rendered only if the server reports `myRecipeCount > 0` (extend the recipes-list response with a small `meta` block: `{my_recipe_count: <n>}`). Clicking sets `?owner=me`.
- Cards for own recipes get a tiny "Mein Rezept" label in place of the category label.

### `/rezept/[slug]` detail page

- If `is_mine === true`: small "Bearbeiten" link in the top-right (mobile) / next to title (desktop). Delete behind a confirm dialog (kebab menu on mobile, button on desktop).
- Admin sees the same controls regardless of ownership.

### `/rezept/[slug]/bearbeiten`

- Same `RecipeForm`, `mode='edit'`, with the existing recipe data pre-loaded. Saves via PUT.

### Admin panel

`/admin/rezepte` (new or extended) lists all recipes with an "Owner" column. Filter chips: `Alle · Global (Admin) · Nutzer-Rezepte`. Click → existing edit form. Delete with the existing confirm dialog.

### Empty / blocked states

- Daily AI cap reached: "Tägliches KI-Limit erreicht (20). Du kannst weiterhin manuell anlegen." (link to `/neu/manuell`)
- Global queue full: "Server ist gerade ausgelastet. Bitte gleich nochmal versuchen."
- AI failed: "KI konnte kein Rezept aus den Bildern lesen. [Erneut versuchen] [Manuell anlegen]"

### Desktop

Same routes; layout splits "Wie anlegen?" left, "In Bearbeitung" right. The recipe form is already responsive in the existing admin form.

## Permissions matrix

| Endpoint | Anonymous | Authed user | Admin |
|---|---|---|---|
| `GET /api/recipes` | 401 | admin recipes ∪ own | admin recipes ∪ own |
| `GET /api/recipes?owner=me` | 401 | own only | own only |
| `GET /api/admin/recipes` (new) | 401 | 403 | all, with `owner_email` |
| `GET /api/recipes/{slug}` | 401 | 200 if global or own; **404** otherwise (don't leak existence) | 200 always |
| `POST /api/recipes` | 401 | creates with `owner_id=me`; admin-only fields ignored | creates with `owner_id=NULL` |
| `PUT /api/recipes/{slug}` | 401 | 200 if own; 403 if global; 404 if other user's | 200 always |
| `DELETE /api/recipes/{slug}` | 401 | same as PUT | 200 always |
| `POST /api/ai-jobs` | 401 | 200 / 429 | 200 / 429 |
| AI provider override in `POST /api/ai-jobs` body | — | ignored, default forced | honored |

A small helper `recipeAccess(store, slug, user) (recipe, canEdit)` centralizes the ownership check used by GET/PUT/DELETE.

## Failure modes

| Failure | Worker behavior | User sees |
|---|---|---|
| Vision API 5xx / network | retry up to 3 attempts, exponential backoff | "noch in Bearbeitung" |
| Output schema invalid (rare with structured-output mode) | 1 retry with corrective prompt; on second failure → `failed` | "KI konnte kein Rezept lesen. [Erneut] [Manuell]" |
| API key missing / config error | mark `failed`, log loudly | "Service derzeit nicht verfügbar" |
| User cancels mid-flight | row deleted; goroutine sees `ErrJobCancelled` on next checkpoint | "Abgebrochen" |
| Server crash with `running` job | startup recovery resets to `queued` if attempts < 3 | job resumes |

## Backups

The existing weekly GitHub backup (`internal/backup/`) currently dumps the recipe table. We include user recipes in the backup (with `owner_id` preserved) so a restore is faithful. No separate backup path.

## Testing

### Backend

- `recipes_test.go` (existing): extend with ownership-filter cases — non-admin sees own + global, sees other users' as 404, can edit own but not others'.
- `ai_jobs_test.go` (new): rate-limit enforcement (per-user 3, daily 20, global 50); admin-only provider override; slug-collision suffixing.
- `worker_test.go` (new): `FOR UPDATE SKIP LOCKED` claim, retry logic, startup recovery of orphaned `running` rows. Uses a fake `Extractor` that returns canned results — no real API calls in CI.
- `mock_store.go` (existing) gets the new methods so handler tests run without Postgres.

### Frontend (manual, in the impl plan)

- `/neu` lists pending jobs and polls.
- "Aus Bild" upload of 1, 2, 3 images.
- "Manuell" save creates a recipe with `owner_id=me`.
- "Meine Rezepte" chip appears only after first own recipe.
- Edit/delete on own recipe; 404 on other user's.

### AI evaluation script (`backend/cmd/ai-eval/main.go`)

- Inputs: `eval/dishes.json` — 10 hand-curated dishes, each with `{name, image_urls[3], reference_recipe}`.
- For each (dish, model): call `Extractor.Extract`, record latency, token counts, cost (from in-code price table), and similarity to reference (Jaccard on ingredient names, edit-distance on title, step-count delta).
- Output: `eval/results.md` — one row per (dish, model) plus a per-model summary.
- Run once before promoting a default; result feeds the model-picker default.
- Gated behind `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`; skips models whose key is missing.
- Not part of the deployed binary.

## Cost-ceiling sanity check

Worst case per user per day:
- 20 calls × $0.026 (frontier Sonnet/GPT-5.4) = **$0.52/user/day**
- 20 calls × $0.008 (default GPT-5.4 mini) = **$0.16/user/day**

Global queue cap of 50 in-flight ensures no cost runaway during a load spike.

## Configuration (env vars)

```
ANTHROPIC_API_KEY=…           # optional (skip Claude path if absent)
OPENAI_API_KEY=…              # optional (skip OpenAI path if absent)
AI_DEFAULT_PROVIDER=openai
AI_DEFAULT_MODEL=gpt-5.4-mini
AI_WORKERS=2
AI_PER_USER_ACTIVE_LIMIT=3
AI_PER_USER_DAILY_LIMIT=20
AI_GLOBAL_QUEUE_LIMIT=50
```

All have sensible defaults so a missing env var doesn't break startup; a missing API key just disables that provider.
