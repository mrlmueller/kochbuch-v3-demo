# Frontend polish + weekly backups — design

Two independent work streams bundled in one spec because they share no code (one is `frontend/`, one is `backend/`) and can ship in either order.

## Stream A — Frontend polish

### A1. PWA installation

Goal: tapping "Add to Home Screen" produces a fullscreen, no-URL-bar app on iOS and Android, on every page (not just `/rezept/[slug]`).

**New files:**
- `frontend/public/manifest.json` — name "Mein Kochbuch", short_name "Kochbuch", `display: 'standalone'`, theme_color `#FAF6EF`, background `#FAF6EF`, icons array, `start_url '/'`, `scope '/'`.
- `frontend/public/icons/icon-192.png` (192×192)
- `frontend/public/icons/icon-512.png` (512×512)
- `frontend/public/icons/icon-512-maskable.png` (512×512 with safe padding for Android adaptive icons)
- `frontend/public/icons/apple-touch-icon.png` (180×180)

Icons are generated from a "K" wordmark in DM Serif Display on the cream background `#FAF6EF` with the orange accent `#C2410C`. Maskable variant adds 80px safe padding so Android can crop to a circle without clipping the glyph.

**`frontend/app/layout.tsx` changes:**
```ts
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Kochbuch',
  description: 'Mein persönliches Kochbuch',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kochbuch',
  },
}

export const viewport: Viewport = {
  themeColor: '#FAF6EF',
  viewportFit: 'cover',
}
```

`viewportFit: 'cover'` is what makes standalone iOS extend under the notch instead of rendering inside a white rectangle.

**Safe-area handling:** the only fixed-position UI hugging the bottom is `components/tab-bar.tsx`. Add `paddingBottom: env(safe-area-inset-bottom)` to the tab bar root so it sits above the iOS home-indicator in standalone mode.

### A2. Admin login redirect

`frontend/app/login/page.tsx:24` currently sends admin users to `/admin` and others to `/`. Change to always `router.push('/')`. Admin can navigate to `/admin` from the app shell.

### A3. iOS input zoom

iOS Safari zooms on focus when the input's `font-size < 16px`. Two search inputs in user-facing flows are below 16:
- `frontend/app/suche/page.tsx` — search input (`fontSize: 15`) → bump to 16
- `frontend/components/desktop-header.tsx` — search input → bump to 16 if below

Admin search inputs (`recipe-list.tsx`, `user-list.tsx`) stay as-is — admin is desktop-only in practice.

### A4. Image loader + LCP

**Loader-width warning.** `lib/image-loader.ts` returns Firebase Storage URLs unchanged because Firebase Storage has no width-transform endpoint. Next 16 warns because the loader's output doesn't vary by `width`. Fix in `components/blur-image.tsx`: detect Firebase URLs (`firebasestorage.googleapis.com`) and set `unoptimized={true}` for them, so Next emits a plain `<img>` and bypasses the loader for those URLs only. Cloudinary URLs continue going through the loader and benefit from `f_auto,q_auto,c_limit,w_<width>` transforms.

**LCP eager.** Next is flagging recipe card images as LCP candidates because the first card in a grid is above the fold. Fix: pass `priority` (which Next translates to `loading="eager"` + `fetchPriority="high"`) to the **first** card rendered in each above-the-fold list:
- `app/page.tsx` — pass `priority={i === 0}` to the first item of `quick`, `hearty`, `sweet` (mobile) and the first portrait card in `DesktopHome` quick/sweet sections, plus first wide card in hearty
- `app/rezepte/browse-client.tsx` — pass `priority` to the first card in the rendered grid

The featured hero on the home page already has `priority` and stays as-is.

## Stream B — Weekly recipe backups to GitHub

### Goal

Every Sunday 03:00 UTC, the backend writes a JSON dump of all recipes and categories to a private GitHub repo. Restore is manual (clone + parse JSON if ever needed).

### Architecture

```
main.go
  └─ go backup.RunWeekly(ctx, store)   ← started after server is up
       └─ loop:
            wait until next Sunday 03:00 UTC
            collect all recipes + categories from store
            marshal JSON
            PUT to GitHub Contents API (creates or updates file)
            log result
            recompute next firing
```

A goroutine, not an external cron. Single-instance app, container restarts are tolerable (the next iteration just fires later).

### Files

**New:**
- `backend/internal/backup/backup.go` — exports `RunWeekly(ctx context.Context, store db.Store)`. Internal helpers: `nextSunday(now time.Time) time.Time`, `dump(ctx, store) ([]byte, error)`, `pushToGitHub(ctx, content []byte, filename string) error`.

**Modified:**
- `backend/main.go` — after `store := db.NewPostgresStore(pool)`, add `go backup.RunWeekly(ctx, store)`.
- `backend/internal/db/recipes.go` — verify `ListRecipes` already returns full data including ingredients/steps; if not, add a `DumpAll(ctx) ([]Recipe, error)` method.
- `.env.example` (or equivalent) — document new env vars.

### JSON shape

```json
{
  "exported_at": "2026-05-10T03:00:00Z",
  "version": 1,
  "recipe_count": 98,
  "category_count": 4,
  "categories": [ { "slug": "...", "name": "...", "description": "...", "accent": "..." } ],
  "recipes": [
    {
      "slug": "amerikaner",
      "title": "...",
      "category_slug": "...",
      "time_minutes": 35,
      "servings": "20",
      "image_url": "...",
      "image_blurhash": "...",
      "ingredients": [ { "amount": 0, "unit": "", "display": "200 g", "name": "Mehl" } ],
      "steps": ["Schritt 1...", "..."],
      "notes": "...",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

`version: 1` lets future schema changes be detected at restore time.

### File naming

`recipes-YYYY-MM-DD.json` at the repo root. Each Sunday produces a new file (no overwrites; full history retained). Per-recipe split (`recipes/<slug>.json`) was considered but rejected — git history of one bot commit per week is easier to scan than 98 small files.

### GitHub API

`PUT https://api.github.com/repos/{owner}/{repo}/contents/recipes-{YYYY-MM-DD}.json`

Headers:
- `Authorization: Bearer ${BACKUP_GITHUB_TOKEN}`
- `Accept: application/vnd.github+json`
- `X-GitHub-Api-Version: 2022-11-28`

Body:
```json
{
  "message": "weekly backup 2026-05-10",
  "content": "<base64-of-JSON>",
  "branch": "main"
}
```

If the file already exists (extremely unlikely with date-based naming, but possible if the timer fires twice on a clock skew) the API requires `sha`. We treat 422-with-sha-required as a no-op and log; we do not overwrite.

### Env vars (read once at startup)

- `BACKUP_GITHUB_TOKEN` — fine-grained PAT, contents:write only on the backup repo
- `BACKUP_GITHUB_REPO` — `mrlmueller/kochbuch-backups` (owner/repo form)

If either is empty, `RunWeekly` logs "backup disabled (no GitHub credentials)" and returns immediately. This means dev environments don't try to push anywhere.

### Schedule

Compute next-Sunday 03:00 UTC from `time.Now().UTC()`. `time.Sleep` until then. Fire. Recompute. Loop.

`time.Sleep` over `time.Ticker` so we don't drift across restarts — a fresh process recomputes the next Sunday and waits.

### Failure handling

- All errors logged with file name + http status if applicable
- Process never crashes from a backup failure
- A failed iteration just waits for the next Sunday — no immediate retry (avoids hammering GitHub on a misconfigured PAT)

### Out of scope

- Retention/cleanup (manual via GitHub UI when the repo gets too big)
- Restore script (you can clone + parse JSON ad-hoc if needed)
- Per-recipe diff alerts
- Multi-instance deduplication (single-instance app today)

## Build/test plan (both streams)

Frontend:
1. `npm run build` succeeds with no Image-loader warnings on the build output for the touched pages.
2. Manual on iOS Safari: Add to Home Screen → opens fullscreen, no URL bar, on every page.
3. Manual on iOS Safari: focus the search input → no zoom.
4. Manual: log in as admin → land on `/`, not `/admin`.
5. Build output shows no LCP warnings for the user-facing pages.

Backend:
1. `go build` succeeds.
2. With dummy env vars, `RunWeekly` logs "backup disabled" at startup.
3. With real env vars, manually trigger an immediate run (one-off helper) and verify the file appears in the GitHub repo with the expected JSON shape.
