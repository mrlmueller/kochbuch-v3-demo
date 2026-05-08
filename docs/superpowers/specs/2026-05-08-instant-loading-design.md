# Instant loading + responsive skeletons — design

## Problem

Two things go wrong on user-facing pages today:

1. **Wrong skeleton on desktop.** Every user page is `dynamic = 'force-dynamic'` and wraps its content in `<Suspense fallback={<HomeSkeleton/>}>`. The fallbacks come from `components/skeleton.tsx` and have no `lg:` styles — they only render a mobile layout. The route-level `app/*/loading.tsx` files (responsive) only flash briefly before the SSR HTML arrives carrying the wrong mobile skeleton, then content lands.
2. **Navigations are not instant.** `force-dynamic` blocks the static shell. Clicking a card on desktop waits for SSR to complete before anything visual changes.

Caching is solid in spirit (`unstable_cache` + tag-based invalidation already wired) but the routes can't take advantage of it because they're forced dynamic per request.

## Goal

- Click a link → instant route transition with a responsive skeleton until data arrives.
- Skeleton matches the actual layout at every breakpoint.
- Recipe / category data is cached as long as practically possible; admin writes invalidate immediately.
- Admin pages stay exactly as they are.

## Architecture

```
proxy.ts (auth gate, edge)
  └─ unauthenticated → redirect to /login
  └─ authenticated   → render

User-facing pages (Entdecken, Rezepte, Rezept[slug])
  ├─ no cookies()/force-dynamic
  ├─ unstable_instant = { prefetch: 'static' }
  ├─ data via 'use cache' (in-memory)
  └─ route-level loading.tsx is the single skeleton source

Admin pages
  └─ unstable_instant = false (opt out of validation)
  └─ otherwise unchanged
```

Auth is **already** at the edge (`proxy.ts`). Page-level `requireAuth()` calls are redundant — and they're the only thing forcing pages dynamic.

## Per-route changes

| Route | Change |
|---|---|
| `app/page.tsx` (Entdecken) | Drop `force-dynamic` and inline `<Suspense fallback={<HomeSkeleton/>}>`. Add `export const unstable_instant = { prefetch: 'static' }`. Page becomes a thin async server component that renders desktop and mobile layouts directly with cached data. |
| `app/rezepte/page.tsx` | Same migration. The inner `<Suspense>` around `BrowseClient` stays (required because `BrowseClient` calls `useSearchParams()` — it suspends on initial server render). Its fallback is a responsive skeleton extracted from `app/rezepte/loading.tsx` so SSR-on-first-load looks correct. |
| `app/rezept/[slug]/page.tsx` | Drop `force-dynamic`. Add `unstable_instant`. Wrap the slug-keyed fetch in `<Suspense>` so awaiting `params` doesn't suspend the static shell. Keep `generateStaticParams`. |
| `app/suche/page.tsx` | Untouched. Pure client component, no SSR data, instant nav doesn't apply. |
| `app/login/page.tsx` | Untouched. |
| `app/admin/layout.tsx` | Add `export const unstable_instant = false`. |
| `app/admin/**/page.tsx` | Untouched. |

## Data layer (`lib/api.server.ts`)

Replace `unstable_cache` with the `'use cache'` directive. Tag namespace is unchanged so existing `revalidateTag` calls in `app/api/proxy/[...path]/route.ts` continue to work without modification.

```ts
import { cacheTag, cacheLife } from 'next/cache'

export async function getCategories(): Promise<Category[]> {
  'use cache'
  cacheTag('categories')
  cacheLife('weeks')
  // ...fetch with INTERNAL_TOKEN, no session
}

export async function getRecipes(category?: string): Promise<RecipeListItem[]> {
  'use cache'
  cacheTag('recipes')
  cacheLife('weeks')
  // ...
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  'use cache'
  cacheTag('recipes', `recipe-${slug}`)
  cacheLife('weeks')
  // ...
}
```

Removals:
- `requireAuth()` (proxy handles it)
- `_cachedCategories`, `_cachedRecipes`, `_makeCachedRecipe` (replaced by `'use cache'`)
- The `react.cache()` wrappers (no longer needed; `'use cache'` handles dedup)

Kept:
- `getMe()`, `getAdminUsers()`, `getAdminCategories()` — session-authed, uncached, used only by admin.

### Cache lifetime rationale

Recipe data changes only on admin writes; categories change only on deploy. `cacheLife('weeks')` is the upper bound. The cache is invalidated immediately by:

- Build ID (rotates on deploy → all entries invalidated)
- `revalidateTag('recipes')` on POST/PUT/DELETE (already wired)
- `revalidateTag('recipe-${slug}')` on PUT/DELETE of a specific recipe (already wired)

If revalidation ever misses, staleness is bounded by the TTL.

### Verified write paths

`app/api/proxy/[...path]/route.ts` already calls:

- `revalidateTag('recipes', 'max')` on recipe POST
- `revalidateTag('recipe-${slug}', 'max')` and `revalidateTag('recipes', 'max')` on PUT and DELETE

No mutation path exists for categories (read-only from the app; managed via the seed script).

## Skeleton layer

**Single source of truth:** `app/<route>/loading.tsx`. Each one has a desktop branch (`hidden lg:block`) and a mobile branch (`lg:hidden`) that mirror the real page layout.

**Files:**
- `app/loading.tsx` — already exists, reviewed/polished to match `app/page.tsx`
- `app/rezepte/loading.tsx` — same
- `app/rezept/[slug]/loading.tsx` — same
- `app/admin/[slug]/loading.tsx` — untouched

**Deletion:** `components/skeleton.tsx` is removed once no page imports it.

## Config

`next.config.ts`:

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  // existing headers / images config kept as-is
}
```

No experimental flags. `instantNavigationDevToolsToggle` is opt-in for inspection only — leave off in committed config.

## Verification

1. **Build validation.** `next build` runs `unstable_instant` validation on every user-facing route. If a component would block navigation it fails the build with a pointer to the offending await/cookies call. Build green = instant nav guaranteed at every entry point.
2. **Manual.** Hard-reload `/`, `/rezepte`, and `/rezept/<slug>` at desktop width; the responsive skeleton must appear and match the real layout's column count and section structure. Click a recipe card from `/rezepte` — title/image area should appear from the prefetched static shell while the rest streams in.
3. **Cache behaviour.** Edit a recipe in the admin → reload `/rezepte` → the change appears within one request (no TTL wait).

## Out of scope

- `'use cache: remote'` / Redis (single-instance app)
- Touching `app/admin/**` page contents
- Refactoring `app/suche` (pure client search)
- Touching `app/login`
- `generateStaticParams` removal (kept for build-time prerender of known slugs)
