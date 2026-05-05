'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { Category, RecipeListItem } from '@/lib/api'
import { CardGrid, CardList, CardCover } from '@/components/recipe-card'
import { BlurImage } from '@/components/blur-image'
import { FloatingLastRecipe } from '@/components/floating-last-recipe'

type Layout = 'grid' | 'list' | 'cover'
type Sort = 'default' | 'time' | 'name'

interface Props {
  categories: Category[]
  initialRecipes: RecipeListItem[]
  initialCategory: string
  searchQuery?: string
}

// ─── Desktop card ────────────────────────────────────────

function DesktopCard({ recipe, categoryName }: { recipe: RecipeListItem; categoryName: string }) {
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}>
      <div style={{ aspectRatio: '4/5', borderRadius: 4, overflow: 'hidden', marginBottom: 14, position: 'relative', background: 'var(--border)' }}>
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="(min-width:1024px) 25vw, 50vw" blurhash={recipe.image_blurhash} />
        )}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>{categoryName}</div>
      <h3 style={{ fontSize: 18, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.3, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.2 }}>{recipe.title}</h3>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>
        {recipe.time_minutes > 0 ? `${recipe.time_minutes} min` : ''}{recipe.time_minutes > 0 && recipe.servings ? ' · ' : ''}{recipe.servings || ''}
      </div>
    </Link>
  )
}

// ─── Desktop browse ──────────────────────────────────────

interface DesktopBrowseProps extends Props {
  lastRecipe: RecipeListItem | null
}

function DesktopBrowse({ categories, initialRecipes, initialCategory, searchQuery, lastRecipe }: DesktopBrowseProps) {
  const [activeCat, setActiveCat] = useState(initialCategory === 'all' ? 'all' : initialCategory)
  const [sort, setSort] = useState<Sort>('default')

  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.slug, c])), [categories])

  const recipes = useMemo(() => {
    let r = activeCat === 'all' ? initialRecipes : initialRecipes.filter(x => x.category_slug === activeCat)
    if (sort === 'time') r = [...r].sort((a, b) => a.time_minutes - b.time_minutes)
    if (sort === 'name') r = [...r].sort((a, b) => a.title.localeCompare(b.title, 'de'))
    return r
  }, [activeCat, sort, initialRecipes])

  return (
    <main style={{ maxWidth: 1320, margin: '0 auto', padding: '48px 40px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          {searchQuery ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Suchergebnisse für</div>
              <h1 style={{ fontSize: 48, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -1, color: 'var(--text)', margin: 0, lineHeight: 1 }}>„{searchQuery}"</h1>
            </>
          ) : (
            <h1 style={{ fontSize: 48, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -1, color: 'var(--text)', margin: 0, lineHeight: 1 }}>Alle Rezepte</h1>
          )}
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 10 }}>
            {recipes.length} {recipes.length === 1 || (recipes.length === 0 && searchQuery) ? 'Treffer' : 'Rezepte'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Sortieren:</span>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="default">Empfohlen</option>
            <option value="time">Zubereitungszeit</option>
            <option value="name">Alphabetisch</option>
          </select>
        </div>
      </div>

      {/* Category pills */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 36, paddingBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {[{ slug: 'all', name: 'Alle' }, ...categories].map(c => {
          const active = c.slug === activeCat
          return (
            <button key={c.slug} onClick={() => setActiveCat(c.slug)} style={{
              padding: '9px 16px', borderRadius: 999,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text)',
              fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
            }}>{c.name}</button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, rowGap: 48 }}>
        {recipes.map(r => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} />)}
      </div>

      {/* FloatingLastRecipe for desktop — rendered here so it's inside hidden lg:block */}
      {lastRecipe && <FloatingLastRecipe recipe={lastRecipe} />}
    </main>
  )
}

// ─── Main export (mobile + desktop) ─────────────────────

export function BrowseClient({ categories, initialRecipes, initialCategory, searchQuery }: Props) {
  const validSlugs = useMemo(() => new Set(categories.map((c) => c.slug)), [categories])
  const [activeCat, setActiveCat] = useState(
    initialCategory === 'all' || validSlugs.has(initialCategory) ? initialCategory : 'all'
  )
  const [layout, setLayout] = useState<Layout>('cover')
  const [lastRecipeSlug, setLastRecipeSlug] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('browseLayout')
    if (saved === 'cover' || saved === 'grid' || saved === 'list') setLayout(saved)
  }, [])

  // Read last-visited recipe from localStorage (set by PersistLastRecipe)
  useEffect(() => {
    try { setLastRecipeSlug(localStorage.getItem('last_recipe')) } catch {}
  }, [])

  // Scroll position restore — retry after 100 ms so desktop grid has time to render
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('rezepte-scroll-y')
      const y = saved ? parseInt(saved, 10) : NaN
      if (!isNaN(y)) {
        requestAnimationFrame(() => window.scrollTo(0, y))
        const t = setTimeout(() => window.scrollTo(0, y), 100)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  // Scroll position save
  useEffect(() => {
    const handle = () => {
      try {
        sessionStorage.setItem('rezepte-scroll-y', String(Math.round(window.scrollY)))
      } catch {}
    }
    window.addEventListener('scroll', handle, { passive: true })
    return () => window.removeEventListener('scroll', handle)
  }, [])

  const recipes = activeCat === 'all'
    ? initialRecipes
    : initialRecipes.filter((r) => r.category_slug === activeCat)

  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.slug, c])),
    [categories]
  )

  const setLayoutPersist = (l: Layout) => {
    setLayout(l)
    localStorage.setItem('browseLayout', l)
  }

  const lastRecipe = lastRecipeSlug ? initialRecipes.find(r => r.slug === lastRecipeSlug) ?? null : null

  return (
    <>
      {/* Desktop — FloatingLastRecipe is rendered inside DesktopBrowse */}
      <div className="hidden lg:block">
        <DesktopBrowse
          categories={categories}
          initialRecipes={initialRecipes}
          initialCategory={initialCategory}
          searchQuery={searchQuery}
          lastRecipe={lastRecipe}
        />
      </div>

      {/* Mobile */}
      <div className="lg:hidden pb-6">
        <div className="px-5 pt-16 pb-1">
          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.5, lineHeight: 1.05 }}>
            Rezepte
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
            {recipes.length} {recipes.length === 1 ? 'Rezept' : 'Rezepte'}
          </p>
        </div>

        <div className="scroll-snap-x flex gap-2 px-5 py-4">
          {[{ slug: 'all', name: 'Alle' }, ...categories].map((c) => {
            const active = c.slug === activeCat
            return (
              <button
                key={c.slug}
                type="button"
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

        <div className="flex gap-2 px-5 mb-4">
          {(['cover', 'grid', 'list'] as Layout[]).map((l) => (
            <button
              key={l}
              type="button"
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

        {/* FloatingLastRecipe for mobile — inside lg:hidden so it won't conflict with desktop */}
        {lastRecipe && <FloatingLastRecipe recipe={lastRecipe} />}
      </div>
    </>
  )
}
