# Frontend polish + weekly backups — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land five user-visible improvements: PWA install support, iOS-zoom-on-focus fix, admin login redirect to `/`, image loader/LCP cleanup, and a weekly Go backend cron that backs up all recipes to a private GitHub repo.

**Architecture:** Two independent streams (frontend + backend). Stream A uses Next 16's `app/icon.tsx`/`app/apple-icon.tsx`/`app/manifest.ts` file conventions for the PWA — no static PNG assets. Stream B is a single goroutine in the backend that wakes Sunday 03:00 UTC and PUTs a JSON file via the GitHub Contents API.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript, Go 1.26, `net/http` standard library (no new Go deps).

**Source spec:** `docs/superpowers/specs/2026-05-08-polish-and-backups-design.md`

---

## File map

**Frontend create:**
- `frontend/app/icon.tsx` — 512×512 PNG via `ImageResponse`
- `frontend/app/apple-icon.tsx` — 180×180 PNG via `ImageResponse`
- `frontend/app/manifest.ts` — Next manifest route returning the PWA manifest

**Frontend modify:**
- `frontend/app/layout.tsx` — extend `metadata` with `manifest` + `appleWebApp`; add `viewport` export with `viewportFit: 'cover'`
- `frontend/app/login/page.tsx` — drop role-based redirect
- `frontend/app/suche/page.tsx` — search input fontSize 15 → 16
- `frontend/components/desktop-header.tsx` — search input fontSize 13.5 → 16
- `frontend/components/blur-image.tsx` — set `unoptimized` for Firebase Storage URLs
- `frontend/components/recipe-card.tsx` — add `priority` prop to `CardCompact`, `CardList`, `CardCover`, `CardGrid`
- `frontend/app/page.tsx` — pass `priority={i === 0}` to first card in mobile quick/hearty/sweet sections; first card in desktop quick/hearty/sweet sections
- `frontend/app/rezepte/browse-client.tsx` — pass `priority={i === 0}` to first card in each rendered grid

**Backend create:**
- `backend/internal/backup/backup.go` — `RunWeekly`, `nextSundayUTC`, `collectSnapshot`, `pushToGitHub`

**Backend modify:**
- `backend/main.go` — start the goroutine after store init

---

## Task 1: PWA — dynamic icons

**Files:**
- Create: `frontend/app/icon.tsx`
- Create: `frontend/app/apple-icon.tsx`

Next 16 auto-generates `<link rel="icon">` and `<link rel="apple-touch-icon">` tags whenever these files exist. They use `ImageResponse` from `next/og` (zero new deps).

The K-mark uses the existing palette: cream background `#FAF6EF`, accent `#C2410C`, serif "K" centered.

- [ ] **Step 1: Create `frontend/app/icon.tsx`**

```tsx
import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#FAF6EF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#C2410C',
          fontSize: 360,
          fontFamily: 'serif',
          fontWeight: 400,
          letterSpacing: -10,
        }}
      >
        K
      </div>
    ),
    { ...size },
  )
}
```

- [ ] **Step 2: Create `frontend/app/apple-icon.tsx`**

```tsx
import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#FAF6EF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#C2410C',
          fontSize: 130,
          fontFamily: 'serif',
          fontWeight: 400,
          letterSpacing: -4,
        }}
      >
        K
      </div>
    ),
    { ...size },
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/icon.tsx frontend/app/apple-icon.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): add PWA icons via Next image-response

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: PWA — manifest

**Files:**
- Create: `frontend/app/manifest.ts`

`app/manifest.ts` is a Next 16 metadata route. It returns a `MetadataRoute.Manifest` object and Next serves it at `/manifest.webmanifest`.

- [ ] **Step 1: Create `frontend/app/manifest.ts`**

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mein Kochbuch',
    short_name: 'Kochbuch',
    description: 'Mein persönliches Kochbuch',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FAF6EF',
    theme_color: '#FAF6EF',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/manifest.ts
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): add PWA manifest

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: PWA — wire metadata + viewport into root layout

**Files:**
- Modify: `frontend/app/layout.tsx`

Extend the existing `metadata` export with `manifest` + `appleWebApp`. Add a separate `viewport` export with `viewportFit: 'cover'` so iOS extends content under the notch in standalone mode. Manifest path is auto-detected by Next from the `app/manifest.ts` file but specifying it explicitly is the documented contract.

- [ ] **Step 1: Edit `frontend/app/layout.tsx`**

Find:

```ts
import type { Metadata } from 'next'
import { DM_Serif_Display, Manrope } from 'next/font/google'
```

Replace with:

```ts
import type { Metadata, Viewport } from 'next'
import { DM_Serif_Display, Manrope } from 'next/font/google'
```

Find:

```ts
export const metadata: Metadata = {
  title: 'Kochbuch',
  description: 'Mein persönliches Kochbuch',
}
```

Replace with:

```ts
export const metadata: Metadata = {
  title: 'Kochbuch',
  description: 'Mein persönliches Kochbuch',
  manifest: '/manifest.webmanifest',
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

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/layout.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): wire PWA manifest + apple-web-app meta into root layout

viewportFit:'cover' lets standalone-mode pages extend under the iOS
notch instead of rendering inside a white rectangle. appleWebApp.capable
opts every page (not just /rezept/[slug]) into the home-screen
fullscreen mode after Add to Home Screen.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Admin login redirect

**Files:**
- Modify: `frontend/app/login/page.tsx:24`

- [ ] **Step 1: Edit `frontend/app/login/page.tsx`**

Find:

```ts
  const afterFirebase = async (idToken: string) => {
    const user = await clientLogin(idToken)
    router.push(user.role === 'admin' ? '/admin' : '/')
    router.refresh()
  }
```

Replace with:

```ts
  const afterFirebase = async (idToken: string) => {
    await clientLogin(idToken)
    router.push('/')
    router.refresh()
  }
```

The `user` variable is no longer needed; `clientLogin` is still awaited for its session-cookie side effect.

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/login/page.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): always send users to / after login

Admins can navigate to /admin from the app shell. Sending them
straight to /admin after login skipped the Entdecken page and was
inconsistent with other users.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: iOS input zoom kill

**Files:**
- Modify: `frontend/app/suche/page.tsx`
- Modify: `frontend/components/desktop-header.tsx`

iOS Safari zooms on input focus when font-size < 16px. Bumping both search inputs to 16 prevents that without disabling user-zoom globally.

- [ ] **Step 1: Edit `frontend/app/suche/page.tsx`**

Find:

```tsx
            style={{ color: 'var(--text)', fontFamily: 'inherit', fontSize: 15 }}
```

Replace with:

```tsx
            style={{ color: 'var(--text)', fontFamily: 'inherit', fontSize: 16 }}
```

- [ ] **Step 2: Edit `frontend/components/desktop-header.tsx`**

Find:

```tsx
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit' }}
```

Replace with:

```tsx
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--text)', fontFamily: 'inherit' }}
```

- [ ] **Step 3: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/suche/page.tsx frontend/components/desktop-header.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
fix(frontend): bump search input font-size to 16px to stop iOS zoom

iOS Safari zooms on input focus when the input font-size is below 16px.
Search inputs in /suche and the desktop header were 15 and 13.5; both
now 16. Visually the desktop header is unchanged because the input is
inside a styled pill — the slightly larger glyphs are imperceptible.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: BlurImage — pass-through Firebase URLs

**Files:**
- Modify: `frontend/components/blur-image.tsx`

Firebase Storage doesn't have a width-transform endpoint, so `lib/image-loader.ts` returns the URL unchanged for those hosts. Next 16 warns when a custom loader's output doesn't vary by `width`. Setting `unoptimized={true}` on Firebase URLs makes Next emit a plain `<img>` and bypass the loader for those — no warning, no behavior change. Cloudinary URLs continue to use the loader and benefit from `f_auto,q_auto,w_<width>` transforms.

- [ ] **Step 1: Edit `frontend/components/blur-image.tsx`**

Find:

```tsx
export function BlurImage({ blurhash: hash, onLoad, style, ...props }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
```

Replace with:

```tsx
// Firebase Storage has no width-transform endpoint, so the custom loader
// can't honor `width` for these URLs. Bypass the optimizer for them.
function isFirebaseStorage(src: ImageProps['src']): boolean {
  return typeof src === 'string' && src.includes('firebasestorage.googleapis.com')
}

export function BlurImage({ blurhash: hash, onLoad, style, ...props }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const unoptimized = isFirebaseStorage(props.src)
```

Find:

```tsx
      <Image
        {...props}
        ref={imgRef}
        style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' }}
        onLoad={(e) => {
          setLoaded(true)
          onLoad?.(e)
        }}
        onError={() => setLoaded(true)}
      />
```

Replace with:

```tsx
      <Image
        {...props}
        ref={imgRef}
        unoptimized={unoptimized}
        style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' }}
        onLoad={(e) => {
          setLoaded(true)
          onLoad?.(e)
        }}
        onError={() => setLoaded(true)}
      />
```

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/components/blur-image.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
fix(frontend): bypass image optimizer for Firebase Storage URLs

Firebase Storage has no width-transform endpoint, so the custom loader
can't honor Next's width contract for those URLs and dev mode warns.
unoptimized={true} for firebasestorage.googleapis.com hosts emits a
plain <img> for those only; Cloudinary still goes through the loader.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Recipe card — accept and forward `priority`

**Files:**
- Modify: `frontend/components/recipe-card.tsx`

Add an optional `priority` prop to all four card components. They already pass props to `<BlurImage>` which forwards to `<Image>`, but currently they don't accept the prop in their signatures.

- [ ] **Step 1: Edit `frontend/components/recipe-card.tsx`**

Find:

```tsx
interface CardProps {
  recipe: RecipeListItem
  category?: Category
}
```

Replace with:

```tsx
interface CardProps {
  recipe: RecipeListItem
  category?: Category
  priority?: boolean
}
```

Find every `<BlurImage src={recipe.image_url} ...>` (there are four — one per card variant) and add `priority={priority}` to each. Concretely:

`CardGrid` — find:

```tsx
        {recipe.image_url ? (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="50vw" blurhash={recipe.image_blurhash} />
        ) : (
```

Replace with:

```tsx
        {recipe.image_url ? (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="50vw" blurhash={recipe.image_blurhash} priority={priority} />
        ) : (
```

`CardList` — find:

```tsx
export function CardList({ recipe, category }: CardProps) {
```

Replace with:

```tsx
export function CardList({ recipe, category, priority }: CardProps) {
```

Then find:

```tsx
        {recipe.image_url ? (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="92px" blurhash={recipe.image_blurhash} />
        ) : (
```

Replace with:

```tsx
        {recipe.image_url ? (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="92px" blurhash={recipe.image_blurhash} priority={priority} />
        ) : (
```

`CardCover` — find:

```tsx
export function CardCover({ recipe, category }: CardProps) {
```

Replace with:

```tsx
export function CardCover({ recipe, category, priority }: CardProps) {
```

Then find:

```tsx
      {recipe.image_url ? (
        <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="50vw" blurhash={recipe.image_blurhash} />
      ) : (
```

Replace with:

```tsx
      {recipe.image_url ? (
        <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="50vw" blurhash={recipe.image_blurhash} priority={priority} />
      ) : (
```

`CardCompact` — find:

```tsx
export function CardCompact({ recipe }: CardProps) {
```

Replace with:

```tsx
export function CardCompact({ recipe, priority }: CardProps) {
```

Then find:

```tsx
        {recipe.image_url ? (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="180px" blurhash={recipe.image_blurhash} />
        ) : (
```

Replace with:

```tsx
        {recipe.image_url ? (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="180px" blurhash={recipe.image_blurhash} priority={priority} />
        ) : (
```

The first card in `CardGrid` already destructures `{ recipe }` only — it doesn't currently use `category`. The signature change for `CardGrid` is implicit because `CardProps` now includes `priority`; we just need to pass it through to the BlurImage. No signature change at the destructure for `CardGrid` is needed for typing, but cleaner is:

Find:

```tsx
export function CardGrid({ recipe }: CardProps) {
```

Replace with:

```tsx
export function CardGrid({ recipe, priority }: CardProps) {
```

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/components/recipe-card.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): accept priority prop on recipe-card variants

Forwards through to BlurImage so callers can mark above-the-fold first
cards as eager. No behavior change without callers passing the prop.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Pass `priority` from page.tsx (Entdecken)

**Files:**
- Modify: `frontend/app/page.tsx`

The mobile layout's `CardCompact` carousels (quick, sweet) and the `CardList` rows (hearty) need their first card marked priority. The desktop layout's section card grids (`DesktopCard` for quick/sweet, `DesktopCardWide` for hearty) likewise need their first item priority — the page already passes `priority` on the featured hero only.

The desktop `<DesktopCard>` and `<DesktopCardWide>` are local helpers at the top of `page.tsx`. They forward to `<BlurImage>` directly. We extend their signatures to accept `priority` and forward it.

- [ ] **Step 1: Edit `frontend/app/page.tsx`**

Find:

```tsx
function DesktopCard({ recipe, categoryName }: { recipe: RecipeListItem; categoryName: string }) {
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}>
      <div style={{ aspectRatio: '4/5', borderRadius: 4, overflow: 'hidden', marginBottom: 14, position: 'relative', background: 'var(--border)', transition: 'transform 0.4s ease' }}
        className="dh-card">
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="(min-width:1024px) 25vw, 50vw" blurhash={recipe.image_blurhash} />
        )}
      </div>
```

Replace with:

```tsx
function DesktopCard({ recipe, categoryName, priority }: { recipe: RecipeListItem; categoryName: string; priority?: boolean }) {
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}>
      <div style={{ aspectRatio: '4/5', borderRadius: 4, overflow: 'hidden', marginBottom: 14, position: 'relative', background: 'var(--border)', transition: 'transform 0.4s ease' }}
        className="dh-card">
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="(min-width:1024px) 25vw, 50vw" blurhash={recipe.image_blurhash} priority={priority} />
        )}
      </div>
```

Find:

```tsx
function DesktopCardWide({ recipe, categoryName }: { recipe: RecipeListItem; categoryName: string }) {
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'flex', gap: 22, alignItems: 'center' }}>
      <div style={{ width: 200, height: 200, flexShrink: 0, borderRadius: 4, overflow: 'hidden', position: 'relative', background: 'var(--border)' }}>
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="200px" blurhash={recipe.image_blurhash} />
        )}
      </div>
```

Replace with:

```tsx
function DesktopCardWide({ recipe, categoryName, priority }: { recipe: RecipeListItem; categoryName: string; priority?: boolean }) {
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'flex', gap: 22, alignItems: 'center' }}>
      <div style={{ width: 200, height: 200, flexShrink: 0, borderRadius: 4, overflow: 'hidden', position: 'relative', background: 'var(--border)' }}>
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="200px" blurhash={recipe.image_blurhash} priority={priority} />
        )}
      </div>
```

Find (in `DesktopHome`, the `quick.map` line):

```tsx
            {quick.map(r => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} />)}
```

Replace with:

```tsx
            {quick.map((r, i) => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} priority={i === 0} />)}
```

Find:

```tsx
            {hearty.map(r => <DesktopCardWide key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} />)}
```

Replace with:

```tsx
            {hearty.map((r, i) => <DesktopCardWide key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} priority={i === 0} />)}
```

Find:

```tsx
            {sweet.map(r => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} />)}
```

Replace with:

```tsx
            {sweet.map((r, i) => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} priority={i === 0} />)}
```

In the **mobile** layout (further down in the same file), find:

```tsx
              {quick.map((r) => <CardCompact key={r.slug} recipe={r} />)}
```

Replace with:

```tsx
              {quick.map((r, i) => <CardCompact key={r.slug} recipe={r} priority={i === 0} />)}
```

Find:

```tsx
              {hearty.map((r) => <CardList key={r.slug} recipe={r} />)}
```

Replace with:

```tsx
              {hearty.map((r, i) => <CardList key={r.slug} recipe={r} priority={i === 0} />)}
```

Find:

```tsx
              {sweet.map((r) => <CardCompact key={r.slug} recipe={r} />)}
```

Replace with:

```tsx
              {sweet.map((r, i) => <CardCompact key={r.slug} recipe={r} priority={i === 0} />)}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/page.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): mark first card in Entdecken sections as priority

Each section's first card is the LCP candidate above the fold.
Setting priority resolves Next 16's eager-loading warning and gets
the first image fetching with high priority.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Pass `priority` from browse-client (/rezepte)

**Files:**
- Modify: `frontend/app/rezepte/browse-client.tsx`

The desktop `<DesktopCard>` is a local helper that already forwards to `<BlurImage>`. The mobile branch uses `CardGrid`/`CardList`/`CardCover` from the shared module.

- [ ] **Step 1: Edit `frontend/app/rezepte/browse-client.tsx`**

Find:

```tsx
function DesktopCard({ recipe, categoryName }: { recipe: RecipeListItem; categoryName: string }) {
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}>
      <div style={{ aspectRatio: '4/5', borderRadius: 4, overflow: 'hidden', marginBottom: 14, position: 'relative', background: 'var(--border)' }}>
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="(min-width:1024px) 25vw, 50vw" blurhash={recipe.image_blurhash} />
        )}
      </div>
```

Replace with:

```tsx
function DesktopCard({ recipe, categoryName, priority }: { recipe: RecipeListItem; categoryName: string; priority?: boolean }) {
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}>
      <div style={{ aspectRatio: '4/5', borderRadius: 4, overflow: 'hidden', marginBottom: 14, position: 'relative', background: 'var(--border)' }}>
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="(min-width:1024px) 25vw, 50vw" blurhash={recipe.image_blurhash} priority={priority} />
        )}
      </div>
```

Find:

```tsx
        {recipes.map(r => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} />)}
```

Replace with:

```tsx
        {recipes.map((r, i) => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} priority={i === 0} />)}
```

Then in the mobile branch, find:

```tsx
              {displayRecipes.map((r) => <CardList key={r.slug} recipe={r} category={catMap[r.category_slug]} />)}
```

Replace with:

```tsx
              {displayRecipes.map((r, i) => <CardList key={r.slug} recipe={r} category={catMap[r.category_slug]} priority={i === 0} />)}
```

Find:

```tsx
              {displayRecipes.map((r) => <CardGrid key={r.slug} recipe={r} category={catMap[r.category_slug]} />)}
```

Replace with:

```tsx
              {displayRecipes.map((r, i) => <CardGrid key={r.slug} recipe={r} category={catMap[r.category_slug]} priority={i === 0} />)}
```

Find:

```tsx
              {displayRecipes.map((r) => <CardCover key={r.slug} recipe={r} category={catMap[r.category_slug]} />)}
```

Replace with:

```tsx
              {displayRecipes.map((r, i) => <CardCover key={r.slug} recipe={r} category={catMap[r.category_slug]} priority={i === 0} />)}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "<projektverzeichnis>/frontend" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add frontend/app/rezepte/browse-client.tsx
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(frontend): mark first card in /rezepte grids as priority

Same fix as the Entdecken page: first card in any layout (cover,
grid, list, desktop) is the LCP candidate.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Frontend build verification

**Files:** none changed; verification only.

- [ ] **Step 1: Production build**

```bash
cd "<projektverzeichnis>/frontend" && npm run build
```

Expected: build succeeds. If anything is flagged related to `unstable_instant`, the loader, or LCP, capture the error and report DONE_WITH_CONCERNS.

- [ ] **Step 2: Confirm manifest serves correctly**

```bash
cd "<projektverzeichnis>/frontend" && timeout 10 npm start &
sleep 8
curl -sI http://localhost:3000/manifest.webmanifest | head -5
curl -sI http://localhost:3000/icon | head -5
curl -sI http://localhost:3000/apple-icon | head -5
kill %1 2>/dev/null
```

Expected: 200 responses for all three. Content-Type for manifest is `application/manifest+json`; for icons `image/png`.

If `npm start` fails due to a port conflict or environment issue, treat the curl checks as DONE_WITH_CONCERNS — manual browser verification will close it out later.

- [ ] **Step 3: Commit (only if anything changed)**

If the verification step found issues that needed fixes, commit them. Otherwise skip.

---

## Task 11: Backup package skeleton

**Files:**
- Create: `backend/internal/backup/backup.go`

Stand up the package with the snapshot-collection function. No GitHub call yet, no scheduling — just data shaping and a unit-testable function.

- [ ] **Step 1: Create `backend/internal/backup/backup.go`**

```go
package backup

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"backend/internal/db"
	"backend/internal/models"
)

// Snapshot is the JSON shape committed to GitHub on each weekly backup.
// version lets future schema changes be detected at restore time.
type Snapshot struct {
	ExportedAt    time.Time          `json:"exported_at"`
	Version       int                `json:"version"`
	RecipeCount   int                `json:"recipe_count"`
	CategoryCount int                `json:"category_count"`
	Categories    []models.Category  `json:"categories"`
	Recipes       []models.Recipe    `json:"recipes"`
}

// collectSnapshot fetches every recipe (with full ingredients/steps) and every
// category from the store. Iterates GetRecipeBySlug per slug so we don't need
// to extend the Store interface for one weekly job.
func collectSnapshot(ctx context.Context, store db.Store) (*Snapshot, error) {
	cats, err := store.GetCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("get categories: %w", err)
	}

	list, err := store.GetRecipes(ctx, db.RecipeFilter{Limit: 10_000})
	if err != nil {
		return nil, fmt.Errorf("list recipes: %w", err)
	}

	recipes := make([]models.Recipe, 0, len(list))
	for _, item := range list {
		full, err := store.GetRecipeBySlug(ctx, item.Slug)
		if err != nil {
			return nil, fmt.Errorf("get recipe %s: %w", item.Slug, err)
		}
		if full == nil {
			continue
		}
		recipes = append(recipes, *full)
	}

	return &Snapshot{
		ExportedAt:    time.Now().UTC(),
		Version:       1,
		RecipeCount:   len(recipes),
		CategoryCount: len(cats),
		Categories:    cats,
		Recipes:       recipes,
	}, nil
}

// marshalSnapshot returns the JSON bytes for a snapshot, with stable two-space
// indentation so commits diff cleanly in GitHub.
func marshalSnapshot(s *Snapshot) ([]byte, error) {
	return json.MarshalIndent(s, "", "  ")
}
```

- [ ] **Step 2: Verify it builds**

```bash
cd "<projektverzeichnis>/backend" && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add backend/internal/backup/backup.go
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(backend): backup package with snapshot collection

collectSnapshot pulls every recipe (full data) plus categories. Iterates
GetRecipeBySlug per slug so we don't extend the Store interface for one
weekly job. JSON shape is versioned so future restores can detect schema
changes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: GitHub Contents API push

**Files:**
- Modify: `backend/internal/backup/backup.go`

Add a function that PUTs a file to a GitHub repo via the Contents API. Standard library only.

- [ ] **Step 1: Edit `backend/internal/backup/backup.go` — replace the import block**

Replace the existing import block at the top of the file:

```go
import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"backend/internal/db"
	"backend/internal/models"
)
```

with:

```go
import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"backend/internal/db"
	"backend/internal/models"
)
```

Then append the following at the end of the file:

```go
// pushToGitHub PUTs a file to a private repo via the Contents API.
// owner/repo example: "mrlmueller/kochbuch-backups". token is a fine-grained
// PAT with contents:write on that repo only. Returns an error if the file
// already exists at that path (we never overwrite — date-based filenames make
// collisions extremely unlikely).
func pushToGitHub(ctx context.Context, owner, repo, token, filename string, content []byte, message string) error {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, filename)

	body, err := json.Marshal(map[string]string{
		"message": message,
		"content": base64.StdEncoding.EncodeToString(content),
		"branch":  "main",
	})
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("github request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		return nil
	}

	respBody, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("github status %d: %s", resp.StatusCode, string(respBody))
}
```

- [ ] **Step 2: Verify it builds**

```bash
cd "<projektverzeichnis>/backend" && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add backend/internal/backup/backup.go
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(backend): GitHub Contents API push for weekly backups

Standard library net/http; PUT a base64'd file to a private repo with a
fine-grained PAT. Treats 200/201 as success, otherwise returns the
GitHub error body so logs are diagnostic.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Schedule loop and entry point

**Files:**
- Modify: `backend/internal/backup/backup.go`
- Modify: `backend/main.go`

Add the loop that wakes every Sunday 03:00 UTC, collects the snapshot, pushes to GitHub. Wire into `main.go`.

- [ ] **Step 1: Edit `backend/internal/backup/backup.go` — append**

```go
// nextSundayUTC returns the next Sunday at 03:00 UTC strictly after `now`.
// Pure function — easy to unit test.
func nextSundayUTC(now time.Time) time.Time {
	now = now.UTC()
	target := time.Date(now.Year(), now.Month(), now.Day(), 3, 0, 0, 0, time.UTC)
	// Days until next Sunday (Sunday == 0): 7 if today's already past 03:00 UTC and is Sunday, else (7 - weekday) % 7
	daysUntilSunday := (7 - int(now.Weekday())) % 7
	if daysUntilSunday == 0 && !now.Before(target) {
		daysUntilSunday = 7
	}
	return target.AddDate(0, 0, daysUntilSunday)
}

// RunWeekly is the long-lived goroutine entry point. Skips silently if
// either env var is missing (so dev environments don't try to push).
// Errors during a backup are logged; the loop continues and tries again
// next Sunday.
func RunWeekly(ctx context.Context, store db.Store, owner, repo, token string) {
	if owner == "" || repo == "" || token == "" {
		fmt.Println("[backup] disabled: BACKUP_GITHUB_REPO or BACKUP_GITHUB_TOKEN not set")
		return
	}
	fmt.Printf("[backup] enabled, target=%s/%s, next run=%s\n", owner, repo, nextSundayUTC(time.Now()).Format(time.RFC3339))

	for {
		next := nextSundayUTC(time.Now())
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}

		if err := runOnce(ctx, store, owner, repo, token); err != nil {
			fmt.Printf("[backup] run failed: %v\n", err)
		}
	}
}

func runOnce(ctx context.Context, store db.Store, owner, repo, token string) error {
	snap, err := collectSnapshot(ctx, store)
	if err != nil {
		return fmt.Errorf("collect: %w", err)
	}
	body, err := marshalSnapshot(snap)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	date := snap.ExportedAt.Format("2006-01-02")
	filename := fmt.Sprintf("recipes-%s.json", date)
	message := fmt.Sprintf("weekly backup %s (%d recipes, %d categories)", date, snap.RecipeCount, snap.CategoryCount)

	if err := pushToGitHub(ctx, owner, repo, token, filename, body, message); err != nil {
		return fmt.Errorf("push: %w", err)
	}
	fmt.Printf("[backup] pushed %s (%d recipes, %d categories, %d bytes)\n", filename, snap.RecipeCount, snap.CategoryCount, len(body))
	return nil
}
```

- [ ] **Step 2: Edit `backend/main.go`**

Find this line:

```go
	"backend/internal/db"
	"backend/internal/handlers"
	mw "backend/internal/middleware"
```

Replace with:

```go
	"backend/internal/backup"
	"backend/internal/db"
	"backend/internal/handlers"
	mw "backend/internal/middleware"
```

Find:

```go
	defer pool.Close()
	store := db.NewPostgresStore(pool)
```

Replace with:

```go
	defer pool.Close()
	store := db.NewPostgresStore(pool)

	// Weekly recipe backups to GitHub. Skips if env vars are missing.
	go backup.RunWeekly(ctx, store,
		os.Getenv("BACKUP_GITHUB_OWNER"),
		os.Getenv("BACKUP_GITHUB_REPO"),
		os.Getenv("BACKUP_GITHUB_TOKEN"))
```

Note the env-var split: `BACKUP_GITHUB_OWNER` (e.g. `mrlmueller`) and `BACKUP_GITHUB_REPO` (e.g. `kochbuch-backups`). Splitting these is cleaner than a single combined `owner/repo` string.

- [ ] **Step 3: Verify it builds**

```bash
cd "<projektverzeichnis>/backend" && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 4: Smoke-run with empty env vars**

```bash
cd "<projektverzeichnis>/backend" && go run . 2>&1 | head -10 &
SERVERPID=$!
sleep 2
kill $SERVERPID 2>/dev/null
```

Expected: somewhere in the logs, see `[backup] disabled: BACKUP_GITHUB_REPO or BACKUP_GITHUB_TOKEN not set`. The server may also fail to start due to missing DB env vars — that's unrelated and OK; we're only checking the backup-disabled log line.

If running the server is impractical because of DB env vars, treat this step as DONE_WITH_CONCERNS.

- [ ] **Step 5: Commit**

```bash
git -C "<projektverzeichnis>" add backend/internal/backup/backup.go backend/main.go
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
feat(backend): weekly recipe backups to GitHub

Goroutine started from main.go after store init. Computes next Sunday
03:00 UTC, sleeps until then, dumps recipes+categories as JSON, PUTs to
the private backup repo via the GitHub Contents API. Skips silently if
BACKUP_GITHUB_OWNER/REPO/TOKEN env vars are unset (dev safe). Errors
are logged; the loop continues and retries next Sunday.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Unit test `nextSundayUTC`

**Files:**
- Create: `backend/internal/backup/backup_test.go`

The schedule logic is the only piece that's unit-testable without mocking everything. Write a focused test for it.

- [ ] **Step 1: Create `backend/internal/backup/backup_test.go`**

```go
package backup

import (
	"testing"
	"time"
)

func TestNextSundayUTC(t *testing.T) {
	tests := []struct {
		name string
		now  time.Time
		want time.Time
	}{
		{
			name: "Monday morning -> next Sunday",
			now:  time.Date(2026, 5, 4, 10, 0, 0, 0, time.UTC), // Monday
			want: time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "Saturday night -> tomorrow Sunday",
			now:  time.Date(2026, 5, 9, 23, 59, 0, 0, time.UTC), // Saturday
			want: time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "Sunday before 03:00 UTC -> today",
			now:  time.Date(2026, 5, 10, 2, 30, 0, 0, time.UTC), // Sunday 02:30
			want: time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "Sunday after 03:00 UTC -> next Sunday",
			now:  time.Date(2026, 5, 10, 4, 0, 0, 0, time.UTC), // Sunday 04:00
			want: time.Date(2026, 5, 17, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "Sunday exactly 03:00 UTC -> next Sunday",
			now:  time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
			want: time.Date(2026, 5, 17, 3, 0, 0, 0, time.UTC),
		},
		{
			name: "non-UTC input is normalized",
			now:  time.Date(2026, 5, 4, 12, 0, 0, 0, time.FixedZone("CEST", 2*3600)), // 10:00 UTC Monday
			want: time.Date(2026, 5, 10, 3, 0, 0, 0, time.UTC),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nextSundayUTC(tt.now)
			if !got.Equal(tt.want) {
				t.Errorf("nextSundayUTC(%v) = %v, want %v", tt.now, got, tt.want)
			}
		})
	}
}
```

- [ ] **Step 2: Run the test**

```bash
cd "<projektverzeichnis>/backend" && go test ./internal/backup/...
```

Expected: `ok  backend/internal/backup ...`. All cases pass.

- [ ] **Step 3: Commit**

```bash
git -C "<projektverzeichnis>" add backend/internal/backup/backup_test.go
git -C "<projektverzeichnis>" commit -m "$(cat <<'EOF'
test(backend): unit test nextSundayUTC schedule logic

Covers Mon morning, Sat night, Sun before 03:00, Sun after 03:00, Sun
at exactly 03:00, and a non-UTC input (DST/timezone normalization).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Roll-out

After Task 14, the branch is ready for review/merge. Manual checks the user runs (browser-only):

1. **PWA on iOS:** Open the site in Safari → Share → Add to Home Screen → tap the home-screen icon → app launches fullscreen, no URL bar, on every page (`/`, `/rezepte`, `/rezept/<slug>`).
2. **iOS zoom:** Tap the search input on iPhone Safari → no page-zoom.
3. **Admin redirect:** Log in with an admin account → land on `/`, not `/admin`.
4. **Image warnings:** Reload `/`, `/rezepte`, `/rezept/<slug>` and watch the dev console — no `loader does not implement width` or `LCP needs eager` warnings for the touched pages.
5. **Backups:** After deploy with `BACKUP_GITHUB_OWNER`, `BACKUP_GITHUB_REPO`, `BACKUP_GITHUB_TOKEN` set, on the next Sunday 03:00 UTC, the new file appears in the backup repo. To verify earlier, temporarily set `nextSundayUTC` to return `time.Now().Add(time.Minute)` and watch the log line `[backup] pushed recipes-YYYY-MM-DD.json`.
