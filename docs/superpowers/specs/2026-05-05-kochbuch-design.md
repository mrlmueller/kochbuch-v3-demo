# Kochbuch v3 — Design Spec

_Date: 2026-05-05_

---

## Overview

A personal mobile-first cookbook app. Users browse, search and view recipes. One designated admin user (identified by Firebase UID) can add, edit and delete recipes through an admin panel. The app is read-only for all other visitors — no login required to browse.

**Stack summary:**
- Frontend: Next.js 16 (Vercel), React 19, TypeScript, Tailwind v4, shadcn/ui
- Backend: Go (chi + pgx), Docker Compose on home server
- Database: PostgreSQL 16
- Images: Cloudinary (free tier, CDN + auto WebP/AVIF)
- Auth (later): Firebase Auth — one admin UID gated in Go middleware
- HTTPS: Caddy (auto Let's Encrypt)

---

## Architecture

```
Browser
  └── Next.js 16 on Vercel (NEXT_PUBLIC_API_URL=https://api.yourdomain.com)
          └── fetches → Caddy (HTTPS termination, home server)
                            └── Go API :8080
                                    └── PostgreSQL :5432

Images: uploaded once via seed script → Cloudinary CDN → served globally
Auth (later): Firebase Auth token → Go middleware verifies → admin routes unlocked
```

All backend services run in a single Docker Compose on the home server. Port 80 + 443 forwarded in router. Domain A record points at home IP.

---

## Data Model

### `categories`

| Column      | Type | Notes                              |
|-------------|------|------------------------------------|
| slug        | TEXT PK | e.g. `"hauptgerichte"`          |
| name        | TEXT | e.g. `"Hauptgerichte"`             |
| description | TEXT |                                    |
| accent      | TEXT | hex color for category tiles       |

Seed data (4 categories):
- `hauptgerichte` / Hauptgerichte / `#C2410C`
- `grundrezepte-und-saucen` / Grundrezepte & Saucen / `#5F7A4F`
- `backen-und-suesses` / Backen & Süßes / `#9333EA`
- `snacks` / Snacks / `#1E5C8A`

### `recipes`

| Column        | Type          | Notes                                          |
|---------------|---------------|------------------------------------------------|
| slug          | TEXT PK       | e.g. `"004_chili_con_carne"`                   |
| title         | TEXT NOT NULL |                                                |
| category_slug | TEXT FK       | → categories(slug)                             |
| time_minutes  | INTEGER       | parsed from `"30 Minuten"` → `30`              |
| servings      | TEXT          | nullable; `"4 Personen"` or empty              |
| ingredients   | JSONB         | `[{"amount":"2 EL","name":"Olivenöl"}, ...]`   |
| steps         | JSONB         | `["Step one...", "Step two..."]`               |
| notes         | TEXT          | nullable tip section                           |
| image_url     | TEXT          | Cloudinary permanent URL                       |
| image_blurhash| TEXT          | nullable; used for placeholder while loading   |
| created_at    | TIMESTAMPTZ   | DEFAULT now()                                  |
| updated_at    | TIMESTAMPTZ   | DEFAULT now()                                  |

`ingredients` and `steps` are stored as JSONB (not separate tables). The app is read-heavy and all ingredient scaling/unit conversion happens client-side, so JSONB is simpler and fast enough.

---

## Go Backend

### Folder structure

```
backend/
  main.go                    ← server setup, chi router, middleware
  internal/
    db/
      db.go                  ← pgx connection pool
      recipes.go             ← GetRecipes, GetRecipeBySlug
      categories.go          ← GetCategories
    handlers/
      recipes.go             ← HTTP handlers, JSON serialisation
      categories.go
    models/
      recipe.go              ← Go structs matching DB columns
      category.go
  cmd/
    seed/
      main.go                ← one-time migration: JSON → Cloudinary + Postgres
  Dockerfile
  go.mod / go.sum
  .env
```

### Dependencies

- `github.com/go-chi/chi/v5` — lightweight router (stdlib-compatible)
- `github.com/jackc/pgx/v5` — PostgreSQL driver + connection pool
- Cloudinary Go SDK (seed script only)

### API Endpoints

```
GET  /health
GET  /api/categories
GET  /api/recipes                    ?category=<slug>&q=<search>&limit=<n>&offset=<n>
GET  /api/recipes/{slug}

# Admin (later, behind Firebase Auth middleware)
POST   /api/admin/recipes
PUT    /api/admin/recipes/{slug}
DELETE /api/admin/recipes/{slug}
```

All responses are JSON. CORS headers allow the Vercel frontend origin.

### Request flow example

```
GET /api/recipes?category=hauptgerichte

chi → handlers.ListRecipes()
  reads query params
  calls db.GetRecipes(ctx, category="hauptgerichte")
    runs: SELECT slug, title, time_minutes, servings, image_url, image_blurhash
          FROM recipes WHERE category_slug = $1 ORDER BY title
  pgx scans rows → []models.Recipe
handlers.ListRecipes writes JSON response
```

---

## Next.js Frontend

### Folder structure

```
frontend/
  app/
    layout.tsx               ← root layout: fonts, global styles
    page.tsx                 ← /  → Entdecken (home / inspiration)
    rezepte/
      page.tsx               ← /rezepte → Browse + category filter pills
    suche/
      page.tsx               ← /suche → Search
    rezept/
      [slug]/
        page.tsx             ← /rezept/[slug] → Recipe detail
    admin/
      layout.tsx             ← Firebase Auth guard (later)
      page.tsx               ← /admin → Recipe list (edit/delete)
      neu/
        page.tsx             ← /admin/neu → Add recipe form
      [slug]/
        page.tsx             ← /admin/[slug] → Edit recipe form
  components/
    ui/                      ← shadcn/ui components
    recipe-card.tsx          ← grid / list / cover / editorial / mosaic variants
    category-grid.tsx        ← 2-col category tiles
    tab-bar.tsx              ← bottom nav
    ingredient-list.tsx      ← serving scaler + unit toggle
    step-list.tsx            ← checkable cooking steps
    search-bar.tsx
  lib/
    api.ts                   ← typed fetch functions → Go backend
    utils.ts
```

### Design system

- **Theme:** warm — bg `#FAF6EF`, accent `#C2410C`, text `#2A1F14`, muted `#7A6B5A`
- **Fonts:** DM Serif Display (headings), Manrope (body)
- **Components:** shadcn/ui base, Tailwind v4 layout
- **Default browse layout:** Cover (2-col full-bleed cards)
- **Default detail layout:** Magazine

### Screens

**Entdecken (`/`)** — inspiration home
- Hero "Rezept des Tages" (first recipe, full-bleed card)
- Horizontal carousel: "Schnell gemacht" (time_minutes ≤ 20)
- 2×2 category grid tiles
- Vertical list: "Herzhaft & sättigend" (hauptgerichte)
- Horizontal carousel: "Süßes & Snacks" (backen + snacks)

**Rezepte (`/rezepte`)** — browse all
- Category filter pills (Alle + 4 categories)
- 5 layout variants: Grid, Liste, Editorial, Cover, Mosaic
- Default: Cover

**Suche (`/suche`)** — search
- Debounced input, calls `GET /api/recipes?q=X`
- Results rendered as list cards
- Suggestion chips when empty

**Rezept detail (`/rezept/[slug]`)**
- 5 layout variants: Klassisch, Tabs, Step-by-Step, Magazin, Split
- Default: Magazin
- Interactive features (all client-side):
  - Serving scaler (+/− buttons, ingredient amounts multiply)
  - Unit toggle (metric / imperial / cups)
  - Step checkboxes (check off as you cook)
  - Screen wake lock (`navigator.wakeLock` — keeps screen on while cooking)

**Admin panel (`/admin`)** — gated by Firebase Auth (later)
- Recipe list (CardList style) with Edit and Delete actions
- Add/Edit form: image upload to Cloudinary, title, time, servings, dynamic ingredient rows, numbered step fields, notes textarea
- Visual design matches existing warm theme — same typography, cards, buttons

### Data fetching

- Browse + detail pages: Next.js Server Components, fetch from Go API
- Search: client component, debounced `fetch` to `GET /api/recipes?q=X`
- No client-side state library — Server Components + `useState` for interactions only

### Layout preference

The browse layout (grid/list/cover/editorial/mosaic) and detail layout (klassisch/tabs/step/magazin/split) are user-selectable. The chosen layout is stored in `localStorage` so it persists across sessions. Default is Cover (browse) and Magazin (detail) on first visit.

---

## Infrastructure

### Docker Compose (home server)

```yaml
services:
  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    env_file: .env

  backend:
    build: ./backend
    depends_on: [postgres]
    ports: ["8080:8080"]
    env_file: .env

  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

volumes:
  pgdata:
  caddy_data:
```

### Caddyfile

```
api.yourdomain.com {
    reverse_proxy backend:8080
}
```

Caddy handles TLS automatically via Let's Encrypt. No certbot, no manual renewal.

### Home server requirements

- Domain/subdomain A record → home IP
- Router: ports 80 + 443 forwarded to the server
- Docker + Docker Compose installed

### Vercel (frontend)

- Connect `frontend/` directory to Vercel project
- Environment variable: `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
- Auto-deploys on every push to `main`

### Environment variables (`.env`, never committed)

```
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<secret>
DB_NAME=kochbuch
DB_SSLMODE=disable

SERVER_ADDR=:8080
ALLOWED_ORIGIN=https://your-vercel-app.vercel.app

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

ADMIN_USER_ID=          # Firebase UID — fill in when auth is wired
```

---

## Data Migration (one-time seed script)

`go run ./cmd/seed` does the following:

1. Reads `kochbuch-data/recipes_export_*/categories.json` → inserts into `categories`
2. Reads each recipe JSON from `kochbuch-data/recipes_export_*/recipes/*.json`
3. Parses `time` string → integer minutes (`"30 Minuten"` → `30`, `"1 Stunde"` → `60`, `"1,5 Stunden"` → `90`); ranges like `"45–60 Minuten"` take the lower bound; unparseable values default to `0`
4. Uploads local image file to Cloudinary → stores returned permanent URL
5. Inserts recipe row into Postgres

After the seed runs, `kochbuch-data/` is an archive only. Live data lives in Postgres; images live in Cloudinary.

---

## Future: Firebase Auth + Admin

When auth is added:
1. Firebase Auth on the frontend issues a JWT on login
2. Frontend sends `Authorization: Bearer <token>` header on admin requests
3. Go middleware verifies the token using Firebase Admin SDK
4. Middleware checks `uid == ADMIN_USER_ID` env var → allows `/api/admin/*` routes
5. Admin panel at `/admin` becomes accessible

No auth library decision needs to be made now — the API is already shaped correctly for it.

---

## Out of Scope (this phase)

- Firebase Auth implementation
- Shopping list generation
- Recipe print view
- Offline / PWA support
- Multiple admin users / roles
