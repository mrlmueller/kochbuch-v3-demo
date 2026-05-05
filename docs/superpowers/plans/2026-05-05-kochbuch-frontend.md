# Kochbuch v3 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js 16 frontend — mobile-first cookbook app with warm theme (DM Serif Display + Manrope), three main screens (Entdecken / Rezepte / Suche), recipe detail with interactive features (serving scaler, unit toggle, step checkboxes, screen wake lock), and an admin panel scaffold.

**Architecture:** Next.js 16 App Router with async Server Components for data fetching (no caching by default). `params` is a Promise in Next.js 16 — always `await params`. Client components (`'use client'`) used only for interactive features. `lib/api.ts` contains all typed fetch functions pointing at the Go backend. shadcn/ui for base components. Layout preference (browse/detail) stored in localStorage.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript, Tailwind v4, shadcn/ui, DM Serif Display + Manrope (Google Fonts).

**Prerequisite:** Backend plan complete and `NEXT_PUBLIC_API_URL` set (e.g. `http://localhost:8080` for local dev).

---

## File map

```
frontend/
  app/
    layout.tsx                            rewrite
    page.tsx                              rewrite (Entdecken home)
    rezepte/page.tsx                      create
    suche/page.tsx                        create
    rezept/[slug]/page.tsx                create
    admin/layout.tsx                      create
    admin/page.tsx                        create
    admin/neu/page.tsx                    create
    admin/[slug]/page.tsx                 create
    globals.css                           rewrite
  components/
    tab-bar.tsx                           create
    recipe-card.tsx                       create
    category-grid.tsx                     create
    ingredient-list.tsx                   create
    step-list.tsx                         create
    search-bar.tsx                        create
    browse-layout-picker.tsx              create
    detail-layout-picker.tsx              create
  lib/
    api.ts                                create
    utils.ts                              create
  next.config.ts                          modify
  .env.local.example                      create
```

---

## Task 1: Install shadcn/ui + configure fonts

**Files:**
- Modify: `frontend/package.json` (via CLI)
- Modify: `frontend/app/globals.css`
- Modify: `frontend/next.config.ts`
- Create: `frontend/.env.local.example`

> ⚠️ **Read first:** Before writing any Next.js code, open `frontend/node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` and `03-layouts-and-pages.md`. Key facts for Next.js 16: `params` is a Promise (must `await params`), `fetch` is NOT cached by default, layouts/pages use the same async function pattern as before.

- [ ] **Step 1: Create .env.local.example**

`frontend/.env.local.example`:
```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Copy to `.env.local` and fill in the real backend URL.

- [ ] **Step 2: Install shadcn/ui**

```bash
cd frontend
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Stone
- CSS variables: Yes

This creates `components/ui/` and updates `globals.css`.

- [ ] **Step 3: Add shadcn components we need**

```bash
cd frontend
npx shadcn@latest add button input badge sheet skeleton tabs
```

- [ ] **Step 4: Update next.config.ts to allow Cloudinary images**

`frontend/next.config.ts`:
```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 5: Rewrite globals.css with warm theme tokens**

`frontend/app/globals.css`:
```css
@import "tailwindcss";

@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Manrope:wght@400;500;600;700&display=swap');

:root {
  --bg: #FAF6EF;
  --card-bg: #FFFFFF;
  --text: #2A1F14;
  --muted: #7A6B5A;
  --accent: #C2410C;
  --border: rgba(120, 90, 60, 0.14);
  --card-shadow: 0 1px 2px rgba(80,50,20,0.04), 0 4px 16px rgba(80,50,20,0.06);
  --tab-bg: rgba(250, 246, 239, 0.85);
  --font-serif: 'DM Serif Display', Georgia, serif;
  --font-sans: 'Manrope', system-ui, sans-serif;
}

* { box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

/* Hide scrollbars on category/carousel strips */
.scroll-snap-x {
  overflow-x: auto;
  scrollbar-width: none;
}
.scroll-snap-x::-webkit-scrollbar { display: none; }
```

- [ ] **Step 6: Verify dev server starts**

```bash
cd frontend && npm run dev
```
Open `http://localhost:3000` — should show the default Next.js page with no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): install shadcn/ui, configure fonts and theme tokens"
```

---

## Task 2: Root layout + tab bar

**Files:**
- Rewrite: `frontend/app/layout.tsx`
- Create: `frontend/components/tab-bar.tsx`

- [ ] **Step 1: Create tab bar component**

`frontend/components/tab-bar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  {
    href: '/',
    label: 'Entdecken',
    icon: (active: boolean) => (
      <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <path d="M9 22V12h6v10"/>
      </svg>
    ),
  },
  {
    href: '/rezepte',
    label: 'Rezepte',
    icon: (active: boolean) => (
      <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z"/>
        <path d="M4 19.5A2.5 2.5 0 016.5 22H20"/>
      </svg>
    ),
  },
  {
    href: '/suche',
    label: 'Suchen',
    icon: (_active: boolean) => (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
    ),
  },
]

export function TabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex justify-around items-center"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 12px)',
        paddingTop: 8,
        paddingLeft: 12,
        paddingRight: 12,
        background: 'var(--tab-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '0.5px solid var(--border)',
      }}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href ||
          (tab.href !== '/' && pathname.startsWith(tab.href))
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center gap-1 px-4 py-1.5 no-underline"
            style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
          >
            {tab.icon(active)}
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.1 }}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Rewrite root layout**

`frontend/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'
import { TabBar } from '@/components/tab-bar'

export const metadata: Metadata = {
  title: 'Kochbuch',
  description: 'Mein persönliches Kochbuch',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>
        <main className="pb-24 min-h-screen" style={{ background: 'var(--bg)' }}>
          {children}
        </main>
        <TabBar />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify dev server — check tab bar renders**

```bash
cd frontend && npm run dev
```
Open `http://localhost:3000` — tab bar should appear at bottom with three tabs.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/layout.tsx frontend/components/tab-bar.tsx
git commit -m "feat(frontend): root layout with bottom tab bar"
```

---

## Task 3: API client + types

**Files:**
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/utils.ts`

- [ ] **Step 1: Create typed API client**

`frontend/lib/api.ts`:
```typescript
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export interface Category {
  slug: string
  name: string
  description: string
  accent: string
}

export interface Ingredient {
  amount: number    // numeric (0 if unparseable)
  unit: string
  display: string   // original string e.g. "500 g"
  name: string
}

export interface RecipeListItem {
  slug: string
  title: string
  category_slug: string
  time_minutes: number
  servings: string
  image_url: string
  image_blurhash: string
}

export interface Recipe extends RecipeListItem {
  ingredients: Ingredient[]
  steps: string[]
  notes: string
  created_at: string
  updated_at: string
}

export interface RecipeFilter {
  category?: string
  q?: string
}

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${API}/api/categories`)
  if (!res.ok) throw new Error(`getCategories: ${res.status}`)
  return res.json()
}

export async function getRecipes(filter: RecipeFilter = {}): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)
  const qs = params.toString()
  const res = await fetch(`${API}/api/recipes${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`getRecipes: ${res.status}`)
  return res.json()
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  const res = await fetch(`${API}/api/recipes/${slug}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`getRecipe: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Create utils**

`frontend/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Parse servings string to number. Falls back to defaultVal. */
export function parseServings(s: string, defaultVal = 4): number {
  const n = parseInt(s, 10)
  return isNaN(n) || n <= 0 ? defaultVal : n
}

/**
 * Format an ingredient amount with serving scale and unit conversion.
 * Returns the display string to show (e.g. "750 g", "3 EL", "nach Bedarf").
 */
export function formatIngredientAmount(
  amount: number,
  unit: string,
  display: string,
  scale: number,
  unitMode: 'metric' | 'imperial' | 'cups'
): string {
  if (amount === 0) return display  // unparseable — show as-is

  let a = amount * scale
  let u = unit

  if (unitMode === 'imperial') {
    if (u === 'g')  { a = a / 28.35;  u = 'oz' }
    else if (u === 'kg') { a = a * 2.205;  u = 'lb' }
    else if (u === 'ml') { a = a / 29.57;  u = 'fl oz' }
    else if (u === 'l' || u === 'Liter') { a = a * 4.227; u = 'cups' }
  } else if (unitMode === 'cups') {
    if (u === 'g') {
      if (a >= 120) { a = a / 120; u = 'cups' }
      else { a = Math.round(a / 8); u = 'EL' }
    } else if (u === 'ml') {
      if (a >= 240) { a = a / 240; u = 'cups' }
      else if (a >= 15) { a = a / 15; u = 'EL' }
      else { a = a / 5; u = 'TL' }
    }
  }

  // Round display value
  let rounded: string
  if (a >= 100) rounded = Math.round(a).toString()
  else if (a >= 10) rounded = (Math.round(a * 10) / 10).toString()
  else rounded = (Math.round(a * 100) / 100).toString()

  return u ? `${rounded} ${u}` : rounded
}
```

- [ ] **Step 3: Install clsx + tailwind-merge (needed by utils)**

```bash
cd frontend && npm install clsx tailwind-merge
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/
git commit -m "feat(frontend): API client types and utility functions"
```

---

## Task 4: Recipe card component

**Files:**
- Create: `frontend/components/recipe-card.tsx`

This single file exports all card variants used by the browse screen.

- [ ] **Step 1: Create recipe card variants**

`frontend/components/recipe-card.tsx`:
```tsx
import Image from 'next/image'
import Link from 'next/link'
import type { RecipeListItem, Category } from '@/lib/api'

interface CardProps {
  recipe: RecipeListItem
  category?: Category
}

// Shared meta pill
function TimePill({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: 'var(--muted)' }}>
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
      </svg>
      {minutes} min
    </span>
  )
}

// 1. GRID — classic card with photo + meta
export function CardGrid({ recipe, category }: CardProps) {
  return (
    <Link href={`/rezept/${recipe.slug}`} className="no-underline block rounded-[18px] overflow-hidden"
      style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
      <div className="relative" style={{ aspectRatio: '4/3' }}>
        {recipe.image_url ? (
          <Image src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="50vw" />
        ) : (
          <div className="w-full h-full" style={{ background: 'var(--border)' }} />
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold mb-1 line-clamp-2" style={{ fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2 }}>
          {recipe.title}
        </p>
        <TimePill minutes={recipe.time_minutes} />
      </div>
    </Link>
  )
}

// 2. LIST — horizontal photo + text
export function CardList({ recipe, category }: CardProps) {
  return (
    <Link href={`/rezept/${recipe.slug}`} className="no-underline flex gap-3 p-3 rounded-2xl"
      style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
      <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 92, height: 92 }}>
        {recipe.image_url ? (
          <Image src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="92px" />
        ) : (
          <div className="w-full h-full" style={{ background: 'var(--border)' }} />
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {category && (
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 3 }}>
            {category.name}
          </p>
        )}
        <p className="font-semibold mb-1" style={{ fontSize: 16, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.25 }}>
          {recipe.title}
        </p>
        <TimePill minutes={recipe.time_minutes} />
      </div>
    </Link>
  )
}

// 3. COVER — full-bleed cinematic card
export function CardCover({ recipe, category }: CardProps) {
  return (
    <Link href={`/rezept/${recipe.slug}`} className="no-underline relative block rounded-[22px] overflow-hidden"
      style={{ aspectRatio: '5/6', boxShadow: 'var(--card-shadow)' }}>
      {recipe.image_url ? (
        <Image src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="50vw" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'var(--muted)' }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.15) 45%, transparent 70%)' }} />
      <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', color: 'var(--text)', fontSize: 10 }}>
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
        </svg>
        {recipe.time_minutes}'
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
        {category && (
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85, marginBottom: 3 }}>
            {category.name}
          </p>
        )}
        <p className="font-semibold" style={{ fontSize: 17, fontFamily: 'var(--font-serif)', lineHeight: 1.15, letterSpacing: -0.2 }}>
          {recipe.title}
        </p>
      </div>
    </Link>
  )
}

// 4. COMPACT — for carousels
export function CardCompact({ recipe }: CardProps) {
  return (
    <Link href={`/rezept/${recipe.slug}`} className="no-underline flex-shrink-0" style={{ width: 180 }}>
      <div className="relative rounded-2xl overflow-hidden mb-2.5" style={{ width: 180, height: 180, boxShadow: 'var(--card-shadow)' }}>
        {recipe.image_url ? (
          <Image src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="180px" />
        ) : (
          <div className="w-full h-full" style={{ background: 'var(--border)' }} />
        )}
      </div>
      <p className="font-semibold line-clamp-2 mb-1" style={{ fontSize: 14, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.25 }}>
        {recipe.title}
      </p>
      <TimePill minutes={recipe.time_minutes} />
    </Link>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/recipe-card.tsx
git commit -m "feat(frontend): recipe card variants (grid, list, cover, compact)"
```

---

## Task 5: Category grid component

**Files:**
- Create: `frontend/components/category-grid.tsx`

- [ ] **Step 1: Create component**

`frontend/components/category-grid.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import type { Category } from '@/lib/api'

interface Props {
  categories: Category[]
  recipeCounts: Record<string, number>
}

export function CategoryGrid({ categories, recipeCounts }: Props) {
  const router = useRouter()
  return (
    <div className="grid grid-cols-2 gap-3">
      {categories.map((cat) => {
        const count = recipeCounts[cat.slug] ?? 0
        return (
          <button
            key={cat.slug}
            onClick={() => router.push(`/rezepte?category=${cat.slug}`)}
            className="rounded-[18px] p-4 text-left cursor-pointer border-none"
            style={{
              background: `linear-gradient(135deg, ${cat.accent} 0%, ${cat.accent}dd 100%)`,
              color: '#fff',
              minHeight: 92,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <p className="font-bold" style={{ fontSize: 15, fontFamily: 'var(--font-serif)', lineHeight: 1.2 }}>
              {cat.name}
            </p>
            <p style={{ fontSize: 11, opacity: 0.85, fontWeight: 500 }}>
              {count} {count === 1 ? 'Rezept' : 'Rezepte'}
            </p>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/category-grid.tsx
git commit -m "feat(frontend): category grid component"
```

---

## Task 6: Entdecken home page

**Files:**
- Rewrite: `frontend/app/page.tsx`

- [ ] **Step 1: Build home screen**

`frontend/app/page.tsx`:
```tsx
import Image from 'next/image'
import Link from 'next/link'
import { getCategories, getRecipes } from '@/lib/api'
import { CategoryGrid } from '@/components/category-grid'
import { CardCompact, CardList } from '@/components/recipe-card'

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
  )

  const recipeCounts = categories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.slug] = allRecipes.filter((r) => r.category_slug === cat.slug).length
    return acc
  }, {})

  return (
    <div className="pb-6">
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
            {featured.image_url && (
              <Image src={featured.image_url} alt={featured.title} fill className="object-cover" sizes="100vw" priority />
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
                {featured.time_minutes} min
                {featured.servings ? ` · ${featured.servings}` : ''}
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
        <CategoryGrid categories={categories} recipeCounts={recipeCounts} />
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
  )
}
```

- [ ] **Step 2: Start dev server and verify**

```bash
cd frontend && npm run dev
```
Open `http://localhost:3000`. Verify:
- Header with "Entdecken" + tagline renders
- Featured hero card shows (needs backend running with seeded data)
- Category grid is visible
- No TypeScript errors in terminal

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(frontend): Entdecken home screen"
```

---

## Task 7: Rezepte browse page

**Files:**
- Create: `frontend/app/rezepte/page.tsx`

- [ ] **Step 1: Create browse page**

`frontend/app/rezepte/page.tsx`:
```tsx
import { getCategories, getRecipes } from '@/lib/api'
import { BrowseClient } from './browse-client'

export default async function RezeptePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  const [categories, recipes] = await Promise.all([
    getCategories(),
    getRecipes({ category }),
  ])

  return <BrowseClient categories={categories} initialRecipes={recipes} initialCategory={category ?? 'all'} />
}
```

- [ ] **Step 2: Create browse client component**

`frontend/app/rezepte/browse-client.tsx`:
```tsx
'use client'

import { useState, useEffect } from 'react'
import type { Category, RecipeListItem } from '@/lib/api'
import { CardGrid, CardList, CardCover } from '@/components/recipe-card'

type Layout = 'grid' | 'list' | 'cover'

interface Props {
  categories: Category[]
  initialRecipes: RecipeListItem[]
  initialCategory: string
}

export function BrowseClient({ categories, initialRecipes, initialCategory }: Props) {
  const [activeCat, setActiveCat] = useState(initialCategory)
  const [layout, setLayout] = useState<Layout>('cover')

  useEffect(() => {
    const saved = localStorage.getItem('browseLayout') as Layout
    if (saved) setLayout(saved)
  }, [])

  const recipes = activeCat === 'all'
    ? initialRecipes
    : initialRecipes.filter((r) => r.category_slug === activeCat)

  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c]))

  const setLayoutPersist = (l: Layout) => {
    setLayout(l)
    localStorage.setItem('browseLayout', l)
  }

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="px-5 pt-16 pb-1">
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.5, lineHeight: 1.05 }}>
          Rezepte
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
          {recipes.length} {recipes.length === 1 ? 'Rezept' : 'Rezepte'}
        </p>
      </div>

      {/* Category pills */}
      <div className="scroll-snap-x flex gap-2 px-5 py-4">
        {[{ slug: 'all', name: 'Alle' }, ...categories].map((c) => {
          const active = c.slug === activeCat
          return (
            <button
              key={c.slug}
              onClick={() => setActiveCat(c.slug)}
              className="flex-shrink-0 rounded-full px-3.5 py-2 text-sm font-medium cursor-pointer whitespace-nowrap"
              style={{
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--text)',
                fontFamily: 'inherit',
              }}
            >
              {c.name}
            </button>
          )
        })}
      </div>

      {/* Layout toggle */}
      <div className="flex gap-2 px-5 mb-4">
        {(['cover', 'grid', 'list'] as Layout[]).map((l) => (
          <button
            key={l}
            onClick={() => setLayoutPersist(l)}
            className="px-3 py-1 rounded-lg text-xs font-semibold capitalize cursor-pointer"
            style={{
              background: layout === l ? 'var(--accent)' : 'var(--card-bg)',
              color: layout === l ? '#fff' : 'var(--muted)',
              border: `1px solid ${layout === l ? 'var(--accent)' : 'var(--border)'}`,
              fontFamily: 'inherit',
            }}
          >
            {l === 'cover' ? 'Cover' : l === 'grid' ? 'Grid' : 'Liste'}
          </button>
        ))}
      </div>

      {/* Recipe grid/list */}
      <div className="px-5">
        {layout === 'grid' && (
          <div className="grid grid-cols-2 gap-3">
            {recipes.map((r) => <CardGrid key={r.slug} recipe={r} category={catMap[r.category_slug]} />)}
          </div>
        )}
        {layout === 'list' && (
          <div className="flex flex-col gap-3">
            {recipes.map((r) => <CardList key={r.slug} recipe={r} category={catMap[r.category_slug]} />)}
          </div>
        )}
        {layout === 'cover' && (
          <div className="grid grid-cols-2 gap-3">
            {recipes.map((r) => <CardCover key={r.slug} recipe={r} category={catMap[r.category_slug]} />)}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/rezepte`. Verify category pills work, layout toggle persists on refresh.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/rezepte/
git commit -m "feat(frontend): Rezepte browse page with category filter and layout toggle"
```

---

## Task 8: Suche search page

**Files:**
- Create: `frontend/app/suche/page.tsx`

- [ ] **Step 1: Create search page (client component — needs debounced input)**

`frontend/app/suche/page.tsx`:
```tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import { getRecipes } from '@/lib/api'
import type { RecipeListItem } from '@/lib/api'
import { CardList } from '@/components/recipe-card'

const SUGGESTIONS = ['Tomaten', 'Pasta', 'Schokolade', 'schnell', 'Knoblauch', 'Hähnchen']

export default function SuchePage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecipeListItem[]>([])
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); return }

    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          const data = await getRecipes({ q })
          setResults(data)
        } catch {
          setResults([])
        }
      })
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="pb-6">
      <div className="px-5 pt-16 pb-4">
        <h1 className="mb-4" style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.5, lineHeight: 1.05 }}>
          Suche
        </h1>
        <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rezept oder Zutat..."
            className="flex-1 bg-transparent border-none outline-none text-base"
            style={{ color: 'var(--text)', fontFamily: 'inherit', fontSize: 15 }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-lg leading-none cursor-pointer bg-transparent border-none p-0"
              style={{ color: 'var(--muted)' }}>×</button>
          )}
        </div>
      </div>

      <div className="px-5">
        {!query && (
          <>
            <p className="mb-3 uppercase tracking-wide font-semibold" style={{ fontSize: 13, color: 'var(--muted)', letterSpacing: 0.5 }}>
              Vorschläge
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setQuery(s)}
                  className="px-3.5 py-2 rounded-full text-sm cursor-pointer"
                  style={{ border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', fontFamily: 'inherit' }}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {query && (
          <>
            <p className="mb-3" style={{ fontSize: 13, color: 'var(--muted)' }}>
              {isPending ? 'Suche…' : `${results.length} Treffer`}
            </p>
            <div className="flex flex-col gap-3">
              {results.map((r) => <CardList key={r.slug} recipe={r} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/suche`. Type a search term — results should appear after 300ms.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/suche/
git commit -m "feat(frontend): Suche search page with debounced API call"
```

---

## Task 9: Ingredient list + step list components

**Files:**
- Create: `frontend/components/ingredient-list.tsx`
- Create: `frontend/components/step-list.tsx`

- [ ] **Step 1: Create ingredient list with scaler + unit toggle**

`frontend/components/ingredient-list.tsx`:
```tsx
'use client'

import { useState } from 'react'
import type { Ingredient } from '@/lib/api'
import { formatIngredientAmount, parseServings } from '@/lib/utils'

type UnitMode = 'metric' | 'imperial' | 'cups'

interface Props {
  ingredients: Ingredient[]
  servingsRaw: string
}

export function IngredientList({ ingredients, servingsRaw }: Props) {
  const baseServings = parseServings(servingsRaw)
  const [scale, setScale] = useState(1)
  const [unitMode, setUnitMode] = useState<UnitMode>('metric')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    const next = new Set(checked)
    next.has(i) ? next.delete(i) : next.add(i)
    setChecked(next)
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Für</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}
              className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border-none"
              style={{ background: 'var(--bg)', color: 'var(--text)' }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(baseServings * scale)}
            </span>
            <button onClick={() => setScale((s) => s + 0.25)}
              className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border-none"
              style={{ background: 'var(--bg)', color: 'var(--text)' }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Pers.</span>
        </div>
        <select
          value={unitMode}
          onChange={(e) => setUnitMode(e.target.value as UnitMode)}
          className="text-xs font-semibold rounded-lg px-2 py-1 cursor-pointer"
          style={{ color: 'var(--text)', fontFamily: 'inherit', border: '1px solid var(--border)', background: 'var(--bg)' }}
        >
          <option value="metric">g · ml</option>
          <option value="imperial">oz · fl oz</option>
          <option value="cups">cups</option>
        </select>
      </div>

      {/* Ingredient rows */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
        {ingredients.map((ing, i) => {
          const isChecked = checked.has(i)
          const amountStr = formatIngredientAmount(ing.amount, ing.unit, ing.display, scale, unitMode)
          return (
            <div
              key={i}
              onClick={() => toggle(i)}
              className="flex items-center gap-3 px-4 cursor-pointer"
              style={{
                padding: '12px 16px',
                borderBottom: i < ingredients.length - 1 ? '0.5px solid var(--border)' : 'none',
                opacity: isChecked ? 0.42 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <div className="flex-shrink-0 flex items-center justify-center rounded-md"
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: `1.5px solid ${isChecked ? 'var(--accent)' : 'var(--border)'}`,
                  background: isChecked ? 'var(--accent)' : 'transparent',
                }}>
                {isChecked && (
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </div>
              <span className="flex-1" style={{ fontSize: 14.5, color: 'var(--text)', textDecoration: isChecked ? 'line-through' : 'none' }}>
                {ing.name}
              </span>
              <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {amountStr}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create step list with checkboxes**

`frontend/components/step-list.tsx`:
```tsx
'use client'

import { useState } from 'react'

interface Props {
  steps: string[]
}

export function StepList({ steps }: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    const next = new Set(checked)
    next.has(i) ? next.delete(i) : next.add(i)
    setChecked(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, i) => {
        const isChecked = checked.has(i)
        return (
          <div
            key={i}
            onClick={() => toggle(i)}
            className="flex gap-4 p-4 rounded-2xl cursor-pointer"
            style={{
              background: 'var(--card-bg)',
              boxShadow: 'var(--card-shadow)',
              opacity: isChecked ? 0.5 : 1,
            }}
          >
            <div className="flex-shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: 28, height: 28,
                background: isChecked ? 'var(--accent)' : 'transparent',
                border: `1.5px solid var(--accent)`,
                fontSize: 13, fontWeight: 700,
                color: isChecked ? '#fff' : 'var(--accent)',
                fontFamily: 'var(--font-serif)',
              }}>
              {isChecked ? (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              ) : i + 1}
            </div>
            <p className="flex-1" style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.55, textDecoration: isChecked ? 'line-through' : 'none' }}>
              {step}
            </p>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ingredient-list.tsx frontend/components/step-list.tsx
git commit -m "feat(frontend): ingredient list with scaler/unit toggle, step list with checkboxes"
```

---

## Task 10: Recipe detail page

**Files:**
- Create: `frontend/app/rezept/[slug]/page.tsx`
- Create: `frontend/app/rezept/[slug]/detail-client.tsx`

- [ ] **Step 1: Create detail page (server component)**

`frontend/app/rezept/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { getRecipe, getCategories } from '@/lib/api'
import { DetailClient } from './detail-client'

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [recipe, categories] = await Promise.all([
    getRecipe(slug),
    getCategories(),
  ])

  if (!recipe) notFound()

  const category = categories.find((c) => c.slug === recipe.category_slug)
  return <DetailClient recipe={recipe} categoryName={category?.name ?? ''} />
}
```

- [ ] **Step 2: Create detail client component**

`frontend/app/rezept/[slug]/detail-client.tsx`:
```tsx
'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Recipe } from '@/lib/api'
import { IngredientList } from '@/components/ingredient-list'
import { StepList } from '@/components/step-list'

interface Props {
  recipe: Recipe
  categoryName: string
}

export function DetailClient({ recipe, categoryName }: Props) {
  // Screen wake lock — keep screen on while cooking
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock.request('screen').then((l) => { lock = l }).catch(() => {})
    return () => { lock?.release() }
  }, [])

  return (
    <div className="pb-10">
      {/* Back button + hero image */}
      <div className="relative" style={{ height: 460 }}>
        {recipe.image_url && (
          <Image src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="100vw" priority />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 35%, rgba(0,0,0,0.6) 100%)' }} />
        <Link href="/rezepte"
          className="absolute top-14 left-4 w-10 h-10 rounded-full flex items-center justify-center no-underline"
          style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </Link>
      </div>

      {/* Title block */}
      <div className="px-6 pt-7 pb-0 text-center">
        {categoryName && (
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
            — {categoryName} —
          </p>
        )}
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', lineHeight: 1.05, fontFamily: 'var(--font-serif)', letterSpacing: -0.6, marginBottom: 14 }}>
          {recipe.title}
        </h1>
        <div style={{ width: 32, height: 1, background: 'var(--accent)', margin: '0 auto 14px' }} />
      </div>

      {/* Meta row */}
      <div className="flex justify-center gap-8 px-5 py-6" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <div className="text-center">
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Zeit</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
            {recipe.time_minutes} min
          </p>
        </div>
        {recipe.servings && (
          <>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div className="text-center">
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Personen</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
                {recipe.servings}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Ingredients section */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-4 mb-4">
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)' }}>Zutaten</p>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <IngredientList ingredients={recipe.ingredients} servingsRaw={recipe.servings} />
      </div>

      {/* Steps section */}
      <div className="px-6 py-2">
        <div className="flex items-center gap-4 mb-5">
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)' }}>Zubereitung</p>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <StepList steps={recipe.steps} />
      </div>

      {/* Notes/Tip */}
      {recipe.notes && (
        <div className="mx-6 mt-6 p-4 rounded-2xl flex gap-3"
          style={{ background: `color-mix(in srgb, var(--accent) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(--accent) 25%, transparent)` }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
            <path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.74V17h8v-2.26A7 7 0 0012 2z"/>
          </svg>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Tipp</p>
            <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
              {recipe.notes}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Navigate to a recipe detail page. Verify:
- Hero image shows
- Back button navigates to /rezepte
- Ingredient list renders with +/− scaling controls
- Steps are checkable
- Tip box shows if recipe has notes
- No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add frontend/app/rezept/
git commit -m "feat(frontend): recipe detail page (magazine layout, scaler, step list, wake lock)"
```

---

## Task 11: Admin panel — scaffold + recipe list

**Files:**
- Create: `frontend/app/admin/layout.tsx`
- Create: `frontend/app/admin/page.tsx`

- [ ] **Step 1: Create admin layout (auth guard placeholder)**

`frontend/app/admin/layout.tsx`:
```tsx
// TODO: replace this stub with Firebase Auth check when auth is wired
// For now, admin is accessible to anyone who knows the URL — acceptable for local dev
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create admin recipe list page**

`frontend/app/admin/page.tsx`:
```tsx
import Link from 'next/link'
import { getRecipes, getCategories } from '@/lib/api'

export default async function AdminPage() {
  const [recipes, categories] = await Promise.all([getRecipes(), getCategories()])
  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c.name]))

  return (
    <div className="px-5 pt-16 pb-10">
      <div className="flex items-center justify-between mb-6">
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
          Admin
        </h1>
        <Link href="/admin/neu"
          className="px-4 py-2 rounded-xl text-sm font-semibold no-underline"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          + Neu
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {recipes.map((r) => (
          <div key={r.slug} className="flex items-center gap-3 p-3 rounded-2xl"
            style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate" style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
                {r.title}
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                {catMap[r.category_slug] ?? r.category_slug} · {r.time_minutes} min
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Link href={`/admin/${r.slug}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold no-underline"
                style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                Bearbeiten
              </Link>
              <Link href={`/rezept/${r.slug}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold no-underline"
                style={{ background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                Ansehen
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/admin/layout.tsx frontend/app/admin/page.tsx
git commit -m "feat(frontend): admin panel layout and recipe list"
```

---

## Task 12: Admin — add/edit recipe form

**Files:**
- Create: `frontend/app/admin/neu/page.tsx`
- Create: `frontend/app/admin/[slug]/page.tsx`
- Create: `frontend/app/admin/recipe-form.tsx`

- [ ] **Step 1: Create shared recipe form component**

`frontend/app/admin/recipe-form.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Recipe, Category } from '@/lib/api'

interface Props {
  categories: Category[]
  initial?: Partial<Recipe>
  mode: 'create' | 'edit'
}

interface IngredientRow {
  display: string
  name: string
}

export function RecipeForm({ categories, initial, mode }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(initial?.title ?? '')
  const [categorySlug, setCategorySlug] = useState(initial?.category_slug ?? categories[0]?.slug ?? '')
  const [time, setTime] = useState(initial?.time_minutes?.toString() ?? '')
  const [servings, setServings] = useState(initial?.servings ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '')
  const [steps, setSteps] = useState<string[]>(initial?.steps ?? [''])
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial?.ingredients?.map((i) => ({ display: i.display || `${i.amount} ${i.unit}`, name: i.name })) ??
    [{ display: '', name: '' }]
  )

  const addIngredient = () => setIngredients((p) => [...p, { display: '', name: '' }])
  const removeIngredient = (i: number) => setIngredients((p) => p.filter((_, j) => j !== i))
  const updateIngredient = (i: number, field: 'display' | 'name', val: string) =>
    setIngredients((p) => p.map((ing, j) => j === i ? { ...ing, [field]: val } : ing))

  const addStep = () => setSteps((p) => [...p, ''])
  const removeStep = (i: number) => setSteps((p) => p.filter((_, j) => j !== i))
  const updateStep = (i: number, val: string) => setSteps((p) => p.map((s, j) => j === i ? val : s))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      slug: initial?.slug,
      title, categorySlug, time: parseInt(time, 10) || 0,
      servings, notes, imageUrl, steps: steps.filter(Boolean), ingredients,
    }
    // TODO: wire to POST/PUT /api/admin/recipes when Firebase Auth is added
    console.log('Submit payload:', payload)
    alert('Backend write not yet wired — see console for payload.')
  }

  const fieldStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'var(--card-bg)',
    color: 'var(--text)', fontFamily: 'inherit', fontSize: 15, outline: 'none',
  }
  const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 6, display: 'block' }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 pt-16 pb-10">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => router.back()} className="bg-transparent border-none cursor-pointer p-0" style={{ color: 'var(--accent)', fontSize: 15, fontFamily: 'inherit' }}>
          ← Zurück
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
          {mode === 'create' ? 'Neues Rezept' : 'Bearbeiten'}
        </h1>
        <div style={{ width: 60 }} />
      </div>

      {/* Title */}
      <div>
        <label style={labelStyle}>Titel</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required style={fieldStyle} placeholder="Rezepttitel" />
      </div>

      {/* Category + Time + Servings in grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>Kategorie</label>
          <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} style={fieldStyle}>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Zeit (min)</label>
          <input type="number" value={time} onChange={(e) => setTime(e.target.value)} style={fieldStyle} placeholder="30" />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Portionen</label>
        <input value={servings} onChange={(e) => setServings(e.target.value)} style={fieldStyle} placeholder="4 Personen" />
      </div>

      {/* Image URL */}
      <div>
        <label style={labelStyle}>Bild-URL (Cloudinary)</label>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={fieldStyle} placeholder="https://res.cloudinary.com/..." />
        {imageUrl && <img src={imageUrl} alt="" className="mt-2 rounded-xl w-full object-cover" style={{ maxHeight: 180 }} />}
      </div>

      {/* Ingredients */}
      <div>
        <label style={labelStyle}>Zutaten</label>
        <div className="flex flex-col gap-2">
          {ingredients.map((ing, i) => (
            <div key={i} className="flex gap-2">
              <input value={ing.display} onChange={(e) => updateIngredient(i, 'display', e.target.value)}
                style={{ ...fieldStyle, flex: '0 0 110px' }} placeholder="Menge (z.B. 500 g)" />
              <input value={ing.name} onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                style={{ ...fieldStyle, flex: 1 }} placeholder="Zutat" />
              {ingredients.length > 1 && (
                <button type="button" onClick={() => removeIngredient(i)}
                  className="flex-shrink-0 w-9 h-10 rounded-xl flex items-center justify-center cursor-pointer border-none"
                  style={{ background: 'var(--bg)', color: 'var(--muted)', fontSize: 18 }}>×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addIngredient}
            className="text-sm font-medium cursor-pointer rounded-xl py-2 border-none"
            style={{ background: 'var(--bg)', color: 'var(--accent)', fontFamily: 'inherit', border: '1px dashed var(--border)' }}>
            + Zutat
          </button>
        </div>
      </div>

      {/* Steps */}
      <div>
        <label style={labelStyle}>Zubereitung</label>
        <div className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="flex-shrink-0 w-7 h-10 flex items-center justify-center font-bold"
                style={{ color: 'var(--accent)', fontFamily: 'var(--font-serif)', fontSize: 18 }}>
                {i + 1}
              </span>
              <textarea value={step} onChange={(e) => updateStep(i, e.target.value)} rows={2}
                style={{ ...fieldStyle, resize: 'vertical', flex: 1 }} placeholder={`Schritt ${i + 1}`} />
              {steps.length > 1 && (
                <button type="button" onClick={() => removeStep(i)}
                  className="flex-shrink-0 w-9 h-10 rounded-xl flex items-center justify-center cursor-pointer border-none mt-0"
                  style={{ background: 'var(--bg)', color: 'var(--muted)', fontSize: 18 }}>×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addStep}
            className="text-sm font-medium cursor-pointer rounded-xl py-2 border-none"
            style={{ background: 'var(--bg)', color: 'var(--accent)', fontFamily: 'inherit', border: '1px dashed var(--border)' }}>
            + Schritt
          </button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Tipp (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          style={{ ...fieldStyle, resize: 'vertical' }} placeholder="Optionaler Tipp oder Hinweis..." />
      </div>

      <button type="submit" disabled={isPending}
        className="w-full py-4 rounded-2xl font-semibold text-base cursor-pointer border-none"
        style={{ background: 'var(--accent)', color: '#fff', fontFamily: 'inherit', opacity: isPending ? 0.7 : 1 }}>
        {isPending ? 'Speichern…' : mode === 'create' ? 'Rezept erstellen' : 'Änderungen speichern'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create "neu" page**

`frontend/app/admin/neu/page.tsx`:
```tsx
import { getCategories } from '@/lib/api'
import { RecipeForm } from '../recipe-form'

export default async function AdminNeuPage() {
  const categories = await getCategories()
  return <RecipeForm categories={categories} mode="create" />
}
```

- [ ] **Step 3: Create edit page**

`frontend/app/admin/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { getRecipe, getCategories } from '@/lib/api'
import { RecipeForm } from '../recipe-form'

export default async function AdminEditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [recipe, categories] = await Promise.all([getRecipe(slug), getCategories()])
  if (!recipe) notFound()
  return <RecipeForm categories={categories} initial={recipe} mode="edit" />
}
```

- [ ] **Step 4: Verify admin flow in browser**

Navigate to `http://localhost:3000/admin`. Verify:
- Recipe list renders
- "Bearbeiten" link opens the edit form pre-filled with recipe data
- "+ Neu" opens blank form
- Add/remove ingredient and step rows work
- Submit shows console log (backend write pending auth)

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/
git commit -m "feat(frontend): admin add/edit recipe form (backend write pending auth)"
```

---

## Final verification checklist

```bash
# TypeScript — no errors
cd frontend && npx tsc --noEmit

# Lint
npm run lint

# Start dev server with backend running
npm run dev
```

Then manually verify each route:
- `/` — Entdecken: hero, carousels, category grid all render
- `/rezepte` — Browse: category pills filter correctly, layout toggle persists on refresh
- `/suche` — Search: debounced results appear, suggestion chips work
- `/rezept/[any-slug]` — Detail: image, ingredients with scaler, checkable steps, tip box
- `/admin` — List: all recipes with edit links
- `/admin/neu` — Form: can add/remove ingredient and step rows
- `/admin/[slug]` — Edit: form pre-filled with recipe data

Mobile view (Chrome DevTools device mode) — verify:
- Bottom tab bar sits above device safe area
- Touch targets are large enough
- No horizontal overflow
