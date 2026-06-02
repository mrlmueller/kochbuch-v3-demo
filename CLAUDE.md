# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Kochbuch is a German recipe app: a Go backend (`backend/`) serving a JSON API and a
Next.js 16 frontend (`frontend/`). Recipes can be authored by hand or extracted from
photos via an AI image-to-recipe pipeline. Auth is Firebase (Google sign-in) on an
invite-only user list managed by admins.

## Commands

### Backend (`backend/`, Go 1.26, module name `backend`)
Run all backend commands from inside `backend/`.
- `go run .` — start the API server (runs goose migrations on startup, then listens on `:8080`).
- `go build -o server .` — build the server binary.
- `go test ./...` — run all tests.
- `go test ./internal/handlers -run TestName` — run a single test.
- Postgres for local dev: `docker compose up -d postgres` (compose file is at repo root; exposes `5432` to the host so a host-run `go run .` can connect).

Helper CLIs under `backend/cmd/` (each `go run ./cmd/<name>` from `backend/`):
- `create-admin` — create the first admin user.
- `seed` — seed categories/recipes.
- `restore` — upsert a backup snapshot JSON back into the DB (idempotent, `ON CONFLICT DO UPDATE`).
- `ai-eval` — benchmark AI models against `dishes.json` (needs `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`); run before promoting a default model.
- `ai-smoke` — one live `Extract` call per registered model to verify SDK wiring.

### Frontend (`frontend/`, Next.js 16.2.4 + React 19)
- `npm run dev` — dev server on `:3000`.
- `npm run build` / `npm run start` — production build / serve.
- `npm run lint` — ESLint.

> **Next.js 16 has breaking changes vs. older versions.** Per `frontend/AGENTS.md`: read the relevant guide in `node_modules/next/dist/docs/` before writing frontend code — APIs, conventions, and file structure may differ from training data. Note `proxy.ts` (not `middleware.ts`) and `cacheComponents`/`'use cache'` are in use.

## Architecture

### Backend (`backend/`)
- **Routing** (`main.go`): chi router. Public routes (`/api/auth/login`, `/logout`, `/health`), then a session-gated group, then an admin-only subgroup (`mw.RequireAdmin`). `main.go` is the single source of truth for the route table.
- **Store interface** (`internal/db/store.go`): all persistence goes through the `Store` interface. `postgres.go` is the real impl (pgx pool); `mock_store.go` backs handler tests. Add a method to the interface + both impls when extending.
- **Migrations** (`internal/db` + `backend/migrations/*.sql`): goose (`pressly/goose/v3`), applied automatically on server startup in `runMigrations()`. **Always use goose-format migration files — never raw init SQL or manual schema edits.**
- **Auth** (`internal/middleware/auth.go`): `RequireSession` validates the `session` cookie against the DB. An `X-Internal-Token` header (matching `INTERNAL_TOKEN`) bypasses the cookie check with **no user in context** — this is how the frontend SSR layer fetches public read-only data. `RequireAdmin` rejects nil/non-admin users, so write/admin endpoints stay protected even on the internal-token path. Login verifies a Firebase ID token, then issues an opaque session token; non-admins are limited to a single session.
- **AI pipeline** (`internal/ai/`): an in-process worker pool (`worker.go`) polls the DB for queued `ai_jobs`, claims one, and runs the registered `Extractor`. Extractors self-register in `init()` under `provider:model` keys (`claude.go`, `openai.go`) into `Registry` (`extractor.go`). The model returns a prompt-shaped `Result`; `toRecipePayload` converts it to the frontend `RecipeForm` shape. The category enum and prompt are built live from the DB category list, so **adding a category in the DB (and restarting) makes it selectable with no code change**. Cost tracking is in `cost.go`; per-user/global/daily job limits come from env (`AI_*`).
- **Other**: `internal/cloudinary` (image hosting), `internal/backup` (weekly recipe snapshots pushed to GitHub, started as a goroutine in `main.go`).

### Frontend (`frontend/`, App Router)
There are **three distinct ways** the frontend talks to the backend — pick the right one:
1. **Cached SSR reads** (`lib/api.server.ts`): server components call the backend with the `X-Internal-Token` header (no user session). Wrapped in `'use cache'` with `cacheTag(...)` / `cacheLife('weeks')`. These are global, identical for every user — never put per-user/private data here.
2. **Authenticated proxy** (`app/api/proxy/[...path]/route.ts`): client-side mutations and per-user reads go through this route, which forwards the user's `session` cookie to the backend. Only paths in its `ALLOWED_PREFIXES` are proxied. After a successful recipe write it calls `revalidateTag('recipes' | 'recipe-<slug>')` — **these tags must stay in sync with the `cacheTag(...)` calls in `api.server.ts`**, or admin edits won't bust the SSR cache.
3. **Direct auth** (`lib/api.ts`): `clientLogin`/`clientLogout` hit the backend directly with `credentials: 'include'`, then POST/DELETE `/api/session` to set/clear the httpOnly `session` cookie on the Next.js origin.
- **Route gating** (`proxy.ts`): redirects unauthenticated requests to `/login` based on cookie presence (not validity — the backend does real validation).
- **Owner-aware reads**: `getRecipe` (cached, anonymous) vs `getRecipeAuthed` (carries session, returns the caller's private recipes). Don't let private recipes leak into the cached path.
- **Uploads** (`app/api/upload/route.ts`): signed Cloudinary uploads; supports multipart file uploads and JSON `{url}` re-hosting of external images.

## Deployment
- Push to `main` triggers `.github/workflows/deploy.yml`: builds the backend Docker image, pushes to `ghcr.io/mrlmueller/kochbuch-v3-backend:latest`, then a self-hosted runner (`docker compose pull backend && up -d`) deploys it behind Caddy. The frontend is deployed separately (Vercel).
- Backend env lives in `backend/.env` (DB, `INTERNAL_TOKEN`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, `CLOUDINARY_*`, `GOOGLE_CSE_*`, `GOOGLE_APPLICATION_CREDENTIALS`, `AI_*` limits, `BACKUP_GITHUB_*`).
