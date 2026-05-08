# Instant loading + responsive skeletons — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Next 16 Cache Components on the user-facing routes so client navigations are instant and the responsive route-level skeletons are the only loading UI shown. Admin and login left untouched.

**Architecture:** Auth at the edge (`proxy.ts`) is the gate. User-facing pages drop `force-dynamic` and `requireAuth()`, fetch data via `'use cache'` (week-long TTL, tag-invalidated), and export `unstable_instant = { prefetch: 'static' }` so the build validates instant nav at every entry point. The mobile-only `components/skeleton.tsx` is removed; route-level `app/*/loading.tsx` (already responsive) becomes the single source of skeleton truth.

**Tech Stack:** Next.js 16.2.4, React 19.2, TypeScript, Tailwind 4. No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-05-08-instant-loading-design.md`

---

## File map

**Modify:**
- `frontend/next.config.ts` — enable `cacheComponents`
- `frontend/lib/api.server.ts` — replace `unstable_cache` with `'use cache'`, drop `requireAuth`, drop `react.cache` wrappers
- `frontend/app/page.tsx` — drop `force-dynamic` / `requireAuth` / inner `Suspense+HomeSkeleton`, add `unstable_instant`
- `frontend/app/rezepte/page.tsx` — same migration; inner Suspense fallback becomes the route loading component
- `frontend/app/rezept/[slug]/page.tsx` — same migration; wrap slug-keyed work in Suspense
- `frontend/app/admin/layout.tsx` — add `unstable_instant = false`

**Delete:**
- `frontend/components/skeleton.tsx`

**Untouched:**
- `frontend/proxy.ts` (auth already correct)
- `frontend/app/api/proxy/[...path]/route.ts` (revalidateTag already wired for recipes)
- `frontend/app/loading.tsx`, `frontend/app/rezepte/loading.tsx`, `frontend/app/rezept/[slug]/loading.tsx` (already responsive — skeletons reviewed in Task 9 only if a real layout drift is found)
- `frontend/app/admin/[slug]/loading.tsx` (admin)
- `frontend/app/admin/**/page.tsx` (admin)
- `frontend/app/suche/page.tsx` (client-only debounced search)
- `frontend/app/login/**`

---

## Task 1: Cut feature branch and commit pre-existing untracked loading files

**Files:**
- Modify: working tree (branch creation)
- Add: `frontend/app/loading.tsx`, `frontend/app/rezepte/loading.tsx`, `frontend/app/rezept/[slug]/loading.tsx`, `frontend/app/admin/[slug]/loading.tsx`

These four `loading.tsx` files exist on disk but are untracked. They are load-bearing for the migration. Commit them on the new branch before any edits so the diff for later tasks is clean.

The unrelated modified file `frontend/components/admin/recipe-list.tsx` is **not** part of this work — leave it unstaged.

- [ ] **Step 1: Create the feature branch**

```bash
git -C "<projektverzeichnis>" checkout -b feat/instant-loading
```

Expected: `Switched to a new branch 'feat/instant-loading'`

- [ ] **Step 2: Verify the four loading files are present**

```bash
ls "<projektverzeichnis>/frontend/app/loading.tsx" \
   "<projektverzeichnis>/frontend/app/rezepte/loading.tsx" \
   "<projektverzeichnis>/frontend/app/rezept/[slug]/loading.tsx" \
   "<projektverzeichnis>/frontend/app/admin/[slug]/loading.tsx"
```

Expected: all four paths print, no "No such file" errors.

- [ ] **Step 3: Stage and commit only the four loading files**

```bash
git -C "<projektverzeichnis>" add \
  frontend/app/loading.tsx \
  frontend/app/rezepte/loading.tsx \
  "frontend/app/rezept/[slug]/loading.tsx" \
  "frontend/app/admin/[slug]/loading.tsx"

git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): add responsive route-level loading skeletons

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds with 4 files added.

- [ ] **Step 4: Confirm working tree state**

```bash
git -C "<projektverzeichnis>" status --short
```

Expected: only `M  frontend/components/admin/recipe-list.tsx` remains (pre-existing, untouched).

---

## Task 2: Enable Cache Components in `next.config.ts`

**Files:**
- Modify: `frontend/next.config.ts`

`cacheComponents: true` is the master switch that lets us use the `'use cache'` directive and `unstable_instant` route segment config.

- [ ] **Step 1: Edit `frontend/next.config.ts`**

Replace the existing `nextConfig` object so the file reads exactly:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
    ]
  },
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: no errors. (If `cacheComponents` is rejected as unknown property, the installed `next` types are stale — re-run `npm install` and retry.)

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/next.config.ts
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): enable cacheComponents in next.config.ts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migrate `lib/api.server.ts` to `'use cache'`

**Files:**
- Modify: `frontend/lib/api.server.ts`

Replace the `unstable_cache` + `react.cache` layering with `'use cache'`. Keep the same tag namespace (`'categories'`, `'recipes'`, `recipe-${slug}`) so existing `revalidateTag` calls in `app/api/proxy/[...path]/route.ts` continue to invalidate correctly. Drop `requireAuth()` (proxy.ts handles it) and the `q`-branch of `getRecipes` (provably dead — search is client-side only via `clientGetRecipes`). Use `cacheLife('weeks')` for all three reads — categories never mutate via the app, recipe writes invalidate immediately via tag.

- [ ] **Step 1: Replace the entire file contents**

Overwrite `frontend/lib/api.server.ts` with:

```ts
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cacheTag, cacheLife } from 'next/cache'
import type { Category, RecipeListItem, Recipe, User } from './api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const INTERNAL_TOKEN = process.env.INTERNAL_SSR_TOKEN ?? ''

// ─── Transport ────────────────────────────────────────────────

async function getSession(): Promise<string> {
  const session = (await cookies()).get('session')
  if (!session) redirect('/login')
  return session.value
}

async function backendFetch(path: string, session: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Cookie: `session=${session}` },
  })
}

async function backendFetchInternal(path: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
  })
}

// ─── Public reads (cached, global) ────────────────────────────
//
// Same data for every authenticated user. proxy.ts gates the route at the
// edge; these calls use the internal SSR token. Tags match the
// revalidateTag() calls in app/api/proxy/[...path]/route.ts so admin writes
// bust entries immediately. cacheLife('weeks') is just an upper bound.

export async function getCategories(): Promise<Category[]> {
  'use cache'
  cacheTag('categories')
  cacheLife('weeks')
  try {
    const res = await backendFetchInternal('/api/categories')
    if (!res.ok) throw new Error(`categories: ${res.status}`)
    return res.json()
  } catch {
    return []
  }
}

export async function getRecipes(category: string = ''): Promise<RecipeListItem[]> {
  'use cache'
  cacheTag('recipes')
  cacheLife('weeks')
  try {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    const res = await backendFetchInternal(`/api/recipes${qs}`)
    if (!res.ok) throw new Error(`recipes: ${res.status}`)
    return res.json()
  } catch {
    return []
  }
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  'use cache'
  cacheTag('recipes', `recipe-${slug}`)
  cacheLife('weeks')
  try {
    const res = await backendFetchInternal(`/api/recipes/${slug}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`recipe ${slug}: ${res.status}`)
    return res.json()
  } catch {
    return null
  }
}

// ─── Auth / admin — never cached ──────────────────────────────

export async function getAdminCategories(): Promise<Category[]> {
  const session = await getSession()
  const res = await backendFetch('/api/categories', session)
  if (!res.ok) return []
  return res.json()
}

export async function getMe(): Promise<User | null> {
  try {
    const session = await getSession()
    const res = await backendFetch('/api/auth/me', session)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getAdminUsers(): Promise<User[]> {
  const session = await getSession()
  const res = await backendFetch('/api/admin/users', session)
  if (!res.ok) throw new Error(`getAdminUsers: ${res.status}`)
  return res.json()
}
```

Removed (deliberately):
- `requireAuth` — proxy.ts handles auth at the edge
- `_cachedCategories`, `_cachedRecipes`, `_makeCachedRecipe` — replaced by `'use cache'`
- The `cache(...)` wrappers from `react` — `'use cache'` dedupes within a render
- `import { unstable_cache } from 'next/cache'` — no longer used
- `getRecipes`'s `filter.q` branch — only callers use the client variant (`clientGetRecipes` in `lib/api.ts`)
- The `RecipeFilter` import — no longer needed in this file

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: errors only in pages that still import `requireAuth` (we'll fix those next). If anything else fails, re-read the diff.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/lib/api.server.ts
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
refactor(frontend): migrate api.server.ts to 'use cache'

Replaces unstable_cache + react.cache with the Next 16 'use cache'
directive. Tag namespace unchanged so existing revalidateTag calls in
the proxy route keep busting entries on admin writes. cacheLife('weeks')
is the upper bound; categories never mutate via the app, recipe writes
invalidate immediately by tag.

Drops requireAuth() — proxy.ts handles edge auth — and the dead q-branch
of getRecipes() (search is client-side only).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrate `app/page.tsx` (Entdecken)

**Files:**
- Modify: `frontend/app/page.tsx`

Drop the inner `<Suspense fallback={<HomeSkeleton/>}>` wrapper, the `dynamic = 'force-dynamic'` line, the `requireAuth()` call, and the `HomeSkeleton` and `Suspense` imports. Add `unstable_instant`. The page becomes a thin async server component that calls the cached data fns directly. The route-level `app/loading.tsx` is the only fallback.

Keep all the JSX (DesktopHome, mobile layout) — only the framework wiring changes.

- [ ] **Step 1: Edit imports at the top of `frontend/app/page.tsx`**

Replace:

```ts
import { Suspense } from 'react'
import Link from 'next/link'
import { requireAuth, getCategories, getRecipes } from '@/lib/api.server'
import { CardCompact, CardList } from '@/components/recipe-card'
import { BlurImage } from '@/components/blur-image'
import { HomeSkeleton } from '@/components/skeleton'
import { PersistLastRecipe } from '@/components/persist-last-recipe'
import type { Category, RecipeListItem } from '@/lib/api'

export const dynamic = 'force-dynamic'
```

with:

```ts
import Link from 'next/link'
import { getCategories, getRecipes } from '@/lib/api.server'
import { CardCompact, CardList } from '@/components/recipe-card'
import { BlurImage } from '@/components/blur-image'
import { PersistLastRecipe } from '@/components/persist-last-recipe'
import type { Category, RecipeListItem } from '@/lib/api'

export const unstable_instant = { prefetch: 'static' as const }
```

- [ ] **Step 2: Replace the bottom of the file (the `HomeContent` async fn + the default export)**

Find the line `async function HomeContent() {` and replace everything from that line to end-of-file with:

```ts
export default async function EntdeckenPage() {
  const [categories, allRecipes] = await Promise.all([
    getCategories(),
    getRecipes(),
  ])

  const featured = allRecipes[0]
  const quick = allRecipes.filter((r) => r.time_minutes > 0 && r.time_minutes <= 20)
  const hearty = allRecipes.filter((r) => r.category_slug === 'hauptgerichte').slice(0, 5)
  const sweet = allRecipes.filter(
    (r) => r.category_slug === 'backen-und-suesses' || r.category_slug === 'snacks'
  ).slice(0, 10)

  const recipeCounts = categories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.slug] = allRecipes.filter((r) => r.category_slug === cat.slug).length
    return acc
  }, {})

  return (
    <>
      {featured && <PersistLastRecipe slug={featured.slug} />}

      {/* ── Desktop layout ── */}
      <div className="hidden lg:block">
        <DesktopHome categories={categories} allRecipes={allRecipes} />
      </div>

      {/* ── Mobile layout ── */}
      <div className="lg:hidden pb-6">
        {/* Header */}
        <div className="px-5 pt-16 pb-6">
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>
            Entdecken
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', lineHeight: 1.05, fontFamily: 'var(--font-serif)', letterSpacing: -0.5 }}>
            Was inspiriert<br />dich heute?
          </h1>
        </div>

        {/* Featured hero */}
        {featured && (
          <div className="px-5 mb-8">
            <Link href={`/rezept/${featured.slug}`} className="no-underline relative block rounded-[24px] overflow-hidden" style={{ aspectRatio: '4/5', boxShadow: 'var(--card-shadow)' }}>
              {featured.image_url ? (
                <BlurImage src={featured.image_url} alt={featured.title} fill className="object-cover" sizes="calc(100vw - 40px)" priority blurhash={featured.image_blurhash} />
              ) : (
                <div className="absolute inset-0" style={{ background: 'var(--border)' }} />
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, transparent 50%)' }} />
              <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', color: 'var(--accent)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Rezept des Tages
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <h2 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, fontFamily: 'var(--font-serif)', marginBottom: 8 }}>
                  {featured.title}
                </h2>
                <p style={{ fontSize: 13, opacity: 0.9 }}>
                  {featured.time_minutes > 0 ? `${featured.time_minutes} min` : ''}
                  {featured.servings ? `${featured.time_minutes > 0 ? ' · ' : ''}${featured.servings}` : ''}
                </p>
              </div>
            </Link>
          </div>
        )}

        {/* Schnell gemacht carousel */}
        {quick.length > 0 && (
          <div className="mb-8">
            <div className="flex justify-between items-baseline px-5 mb-3">
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3, lineHeight: 1.1 }}>
                  Schnell gemacht
                </h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Unter 20 Minuten</p>
              </div>
            </div>
            <div className="scroll-snap-x flex gap-3 px-5">
              {quick.map((r) => <CardCompact key={r.slug} recipe={r} />)}
            </div>
          </div>
        )}

        {/* Categories */}
        <div className="px-5 mb-8">
          <h2 className="mb-4" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3 }}>
            Nach Kategorie
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((c) => (
              <Link key={c.slug} href={`/rezepte?category=${c.slug}`} style={{ textDecoration: 'none', padding: '20px 16px', borderRadius: 18, background: c.accent || 'var(--accent)', color: '#fff', minHeight: 100, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 18, fontFamily: 'var(--font-serif)', lineHeight: 1.1 }}>{c.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.85 }}>
                  {recipeCounts[c.slug] ?? 0} Rezepte →
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Herzhaft list */}
        {hearty.length > 0 && (
          <div className="px-5 mb-8">
            <h2 className="mb-4" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3 }}>
              Herzhaft & sättigend
            </h2>
            <div className="flex flex-col gap-3">
              {hearty.map((r) => <CardList key={r.slug} recipe={r} />)}
            </div>
          </div>
        )}

        {/* Süßes carousel */}
        {sweet.length > 0 && (
          <div className="mb-4">
            <h2 className="mb-4 px-5" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3 }}>
              Süßes & Snacks
            </h2>
            <div className="scroll-snap-x flex gap-3 px-5">
              {sweet.map((r) => <CardCompact key={r.slug} recipe={r} />)}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
```

The `DesktopHome`, `DesktopCard`, `DesktopCardWide`, and `SectionHead` helper components above this point in the file are **kept verbatim** — only the bottom-of-file orchestration changed.

- [ ] **Step 3: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: no errors in `app/page.tsx`. Errors in `app/rezepte/page.tsx` and `app/rezept/[slug]/page.tsx` are still fine — they'll be fixed in Tasks 5 and 6.

- [ ] **Step 4: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/page.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): make Entdecken page instant-nav ready

Drops force-dynamic, requireAuth (proxy handles it), and the inner
Suspense wrapping HomeSkeleton (mobile-only). Adds unstable_instant
so next build validates the static shell at every entry point.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Migrate `app/rezepte/page.tsx`

**Files:**
- Modify: `frontend/app/rezepte/page.tsx`

The inner `<Suspense>` wrapping `BrowseClient` stays — `BrowseClient` calls `useSearchParams()` which suspends on initial server render. Its fallback is the responsive route loading component.

- [ ] **Step 1: Overwrite `frontend/app/rezepte/page.tsx`**

Replace the entire file with:

```ts
import { Suspense } from 'react'
import { getCategories, getRecipes } from '@/lib/api.server'
import { BrowseClient } from './browse-client'
import RezepteLoading from './loading'

export const unstable_instant = { prefetch: 'static' as const }

export default async function RezeptePage() {
  const [categories, recipes] = await Promise.all([
    getCategories(),
    getRecipes(),
  ])

  return (
    // Suspense required because BrowseClient uses useSearchParams()
    <Suspense fallback={<RezepteLoading />}>
      <BrowseClient categories={categories} initialRecipes={recipes} />
    </Suspense>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: no errors in `app/rezepte/page.tsx`. Errors only in `app/rezept/[slug]/page.tsx` remain (fixed in Task 6).

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/rezepte/page.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): make /rezepte instant-nav ready

Drops force-dynamic, requireAuth, and the redundant outer Suspense.
The inner Suspense around BrowseClient stays (useSearchParams) but
its fallback is now the responsive route loading skeleton instead of
the mobile-only BrowseSkeleton.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate `app/rezept/[slug]/page.tsx`

**Files:**
- Modify: `frontend/app/rezept/[slug]/page.tsx`

`params` is request-time and suspends in any place it's awaited. To keep the static shell instant we wrap the slug-dependent work in a `<Suspense>` and resolve `params` inline at the boundary so the inner async component receives a plain string.

- [ ] **Step 1: Overwrite `frontend/app/rezept/[slug]/page.tsx`**

Replace the entire file with:

```ts
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getRecipe, getCategories, getRecipes } from '@/lib/api.server'
import { DetailClient } from './detail-client'
import RecipeLoading from './loading'

export const unstable_instant = { prefetch: 'static' as const }

// Pre-generate all current recipe slugs at build time.
// Falls back to on-demand SSR if the backend is unavailable during build.
export async function generateStaticParams() {
  try {
    const recipes = await getRecipes()
    return recipes.map((r) => ({ slug: r.slug }))
  } catch {
    return []
  }
}

async function RecipeContent({ slug }: { slug: string }) {
  const [recipe, categories] = await Promise.all([
    getRecipe(slug),
    getCategories(),
  ])

  if (!recipe) return notFound()

  const category = categories.find((c) => c.slug === recipe.category_slug)
  return <DetailClient recipe={recipe} categoryName={category?.name ?? ''} />
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<RecipeLoading />}>
      {params.then(({ slug }) => <RecipeContent slug={slug} />)}
    </Suspense>
  )
}
```

The `params.then(...)` pattern (instead of `const { slug } = await params`) is what the Next 16 instant-navigation guide prescribes: the await happens inside the Suspense boundary, not above it.

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean across `app/page.tsx`, `app/rezepte/page.tsx`, `app/rezept/[slug]/page.tsx`. Admin and skeleton component errors may remain — fixed in Tasks 7 and 8.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add "frontend/app/rezept/[slug]/page.tsx"
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): make recipe detail page instant-nav ready

Wraps the slug-keyed fetch in Suspense and resolves params inline at
the boundary so the static shell renders before slug is known. Drops
force-dynamic and requireAuth.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Opt admin out of instant-nav validation

**Files:**
- Modify: `frontend/app/admin/layout.tsx`

The admin layout calls `getMe()` (cookies + uncached). With cacheComponents enabled, `unstable_instant` validation would flag the layout. Setting `unstable_instant = false` exempts the entire admin subtree from validation while leaving its runtime behaviour untouched.

- [ ] **Step 1: Add the export at the top of `frontend/app/admin/layout.tsx`**

Find the existing first import line (`import Link from 'next/link'`) and insert above it:

```ts
export const unstable_instant = false
```

So the top of the file becomes:

```ts
export const unstable_instant = false

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMe } from '@/lib/api.server'
```

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: no admin errors. Only the dead `components/skeleton.tsx` may still report (no consumers but file still exists) — fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/admin/layout.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): opt admin layout out of unstable_instant validation

Admin pages read session cookies and stay dynamic; this exempts the
subtree from build-time instant-nav validation without changing
runtime behaviour.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Delete the obsolete `components/skeleton.tsx`

**Files:**
- Delete: `frontend/components/skeleton.tsx`

After Tasks 4–5, no source file imports from this module. Confirm and delete.

- [ ] **Step 1: Verify no remaining importers**

```bash
cd "<projektverzeichnis>" && \
  grep -rln "from '@/components/skeleton'" frontend --include='*.ts' --include='*.tsx' || echo "no matches"
```

Expected: `no matches`. If any path appears, stop — that file still imports the dead module and must be migrated first.

- [ ] **Step 2: Delete the file via git**

```bash
git -C "<projektverzeichnis>" rm frontend/components/skeleton.tsx
```

- [ ] **Step 3: TypeScript + lint check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit && npx eslint .
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
chore(frontend): remove obsolete mobile-only skeleton module

components/skeleton.tsx had only mobile layouts and was the source of
the wrong-skeleton-on-desktop bug. All consumers now use the
responsive route-level loading.tsx files.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Skeleton fidelity review (no-op unless drift found)

**Files:**
- Review only: `frontend/app/loading.tsx`, `frontend/app/rezepte/loading.tsx`, `frontend/app/rezept/[slug]/loading.tsx`

Each route loading file already mirrors the desktop and mobile layout of its page (verified during brainstorming). This task is a structured re-check to ensure the migration didn't introduce any layout drift.

- [ ] **Step 1: Cross-check Entdecken**

Open `frontend/app/page.tsx` and `frontend/app/loading.tsx` side by side. For each desktop section in the page, verify the loading file has:
- A hero with two-column 1fr / 1.3fr grid
- A "Nach Kategorie" 4-tile section
- A "Schnell gemacht" 4-portrait grid
- A "Herzhaft & sättigend" 2-column wide-card grid (4 items)
- A "Süßes & Snacks" 3-portrait grid

Mobile branch should mirror: header → featured 4/5 hero → carousel placeholder → 2-col category grid.

If a section count or column count diverges from the page, fix it inline. Otherwise leave it.

- [ ] **Step 2: Cross-check Rezepte**

Open `frontend/app/rezepte/browse-client.tsx` (DesktopBrowse function) and `frontend/app/rezepte/loading.tsx`. Verify:
- Header row with title + count + Sortieren select
- Filter pill row matching `[Alle, ...categories]`
- 4-column desktop grid; 2-column mobile cover grid

- [ ] **Step 3: Cross-check Recipe detail**

Open `frontend/app/rezept/[slug]/detail-client.tsx` and `frontend/app/rezept/[slug]/loading.tsx`. Verify:
- Desktop: back link → 1fr/1.1fr hero (text + image) → 380px sticky ingredients + flex-1 steps
- Mobile: 460px hero image → centered title block → Zeit/Personen → ingredients table → step list

- [ ] **Step 4: Commit only if you actually changed something**

```bash
git -C "<projektverzeichnis>" status --short
```

If output is empty: skip the commit, move to Task 10. If there are modified files: commit them.

```bash
git -C "<projektverzeichnis>" add -u frontend/app
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
fix(frontend): tighten loading skeleton fidelity to actual layouts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Build + manual verification

**Files:** none changed; verification only.

Build is the structural test — `unstable_instant` validation runs at build time and fails the build with a pointer to any component that would block instant nav. Manual browser verification covers the visual side (responsive skeletons match real layouts).

- [ ] **Step 1: Production build**

```bash
cd "<projektverzeichnis>/frontend" && npm run build
```

Expected: build succeeds. If validation flags a violation in the user-facing routes, the error message names the component and the offending await/cookies access — fix it (typically: wrap in `<Suspense>` or move the await below a boundary) and re-run.

- [ ] **Step 2: Start the dev server**

```bash
cd "<projektverzeichnis>/frontend" && npm run dev
```

Expected: server starts on the configured port (default `:3000`), no `cacheComponents`-related warnings.

- [ ] **Step 3: Manual desktop check at ≥1024px viewport**

In a browser at desktop width:

1. Hard-reload `/`. Confirm the `app/loading.tsx` desktop branch (hero + 4-tile categories + 4-portrait grid + 2-col wide cards + 3-portrait grid) is what appears, not a single-column mobile layout.
2. Hard-reload `/rezepte`. Confirm the desktop branch (header row + filter pills + 4-col grid).
3. Hard-reload `/rezept/<any-slug>`. Confirm the desktop branch (text+image hero + 380px sticky sidebar + steps).
4. From `/rezepte`, click a recipe card. The transition should feel instant — the static shell should be visible immediately.

- [ ] **Step 4: Manual mobile check at <1024px viewport**

Resize the window below 1024px (or use device toolbar).

1. Hard-reload `/`, `/rezepte`, `/rezept/<slug>`. Confirm each shows its mobile branch and matches the real page's structure.

- [ ] **Step 5: Cache invalidation check**

In one tab open `/rezepte`. In another tab open `/admin`. Edit any recipe's title in admin and save. Switch back to `/rezepte` and hard-reload. The new title should appear within one request — if it doesn't, `revalidateTag('recipes')` is failing. Investigate `app/api/proxy/[...path]/route.ts:56-64`.

- [ ] **Step 6: Final status check**

```bash
git -C "<projektverzeichnis>" log --oneline main..HEAD
```

Expected: 7–9 commits on `feat/instant-loading` (one per Task 1–9 that produced changes).

---

## Roll-out

Once all manual checks pass, hand off the branch to the user. They decide whether to merge directly, open a PR, or run additional review (e.g. `/ultrareview`, security review). No further automated steps in this plan.
