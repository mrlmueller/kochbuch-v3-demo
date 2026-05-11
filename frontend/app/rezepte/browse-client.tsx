'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { Category, RecipeListItem } from '@/lib/api'
import { clientGetRecipes } from '@/lib/api'
import { CardGrid, CardList, CardCover } from '@/components/recipe-card'
import { BlurImage } from '@/components/blur-image'
import { FloatingLastRecipe } from '@/components/floating-last-recipe'

type Layout = 'grid' | 'list' | 'cover'
type Sort = 'default' | 'time' | 'name'

const MINE = '__mine__'

interface Props {
  categories: Category[]
  initialRecipes: RecipeListItem[]
}

// ─── Desktop card ────────────────────────────────────────

function DesktopCard({ recipe, categoryName, priority }: { recipe: RecipeListItem; categoryName: string; priority?: boolean }) {
  const label = recipe.is_mine ? 'Mein Rezept' : categoryName
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}>
      <div style={{ aspectRatio: '4/5', borderRadius: 4, overflow: 'hidden', marginBottom: 14, position: 'relative', background: 'var(--border)' }}>
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="(min-width:1024px) 25vw, 50vw" blurhash={recipe.image_blurhash} priority={priority} />
        )}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>{label}</div>
      <h3 style={{ fontSize: 18, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.3, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.2 }}>{recipe.title}</h3>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>
        {recipe.time_minutes > 0 ? `${recipe.time_minutes} min` : ''}{recipe.time_minutes > 0 && recipe.servings ? ' · ' : ''}{recipe.servings || ''}
      </div>
    </Link>
  )
}

// ─── Desktop browse ──────────────────────────────────────

interface DesktopBrowseProps {
  categories: Category[]
  recipes: RecipeListItem[]
  activeCat: string
  setActiveCat: (c: string) => void
  sort: Sort
  setSort: (s: Sort) => void
  searchQuery: string
  lastRecipe: RecipeListItem | null
  myRecipeCount: number
}

function DesktopBrowse({ categories, recipes, activeCat, setActiveCat, sort, setSort, searchQuery, lastRecipe, myRecipeCount }: DesktopBrowseProps) {
  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.slug, c])), [categories])

  // "Meine Rezepte" sits right after "Alle" so it's the first thing users
  // see when they scroll the chip row, and only when the user actually
  // has own recipes.
  const chipDescriptors: { slug: string; name: string }[] = [{ slug: 'all', name: 'Alle' }]
  if (myRecipeCount > 0) chipDescriptors.push({ slug: MINE, name: 'Meine Rezepte' })
  chipDescriptors.push(...categories)

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
            <h1 style={{ fontSize: 48, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -1, color: 'var(--text)', margin: 0, lineHeight: 1 }}>
              {activeCat === MINE ? 'Meine Rezepte' : 'Alle Rezepte'}
            </h1>
          )}
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 10 }}>
            {recipes.length} {recipes.length === 1 ? 'Treffer' : searchQuery ? 'Treffer' : 'Rezepte'}
          </div>
        </div>
        {!searchQuery && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Sortieren:</span>
            <select value={sort} onChange={e => setSort(e.target.value as Sort)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="default">Empfohlen</option>
              <option value="time">Zubereitungszeit</option>
              <option value="name">Alphabetisch</option>
            </select>
          </div>
        )}
      </div>

      {!searchQuery && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 36, paddingBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {chipDescriptors.map(c => {
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
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, rowGap: 48 }}>
        {recipes.map((r, i) => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} priority={i === 0} />)}
      </div>

      {lastRecipe && <FloatingLastRecipe recipe={lastRecipe} />}
    </main>
  )
}

// ─── Main export ─────────────────────────────────────────

export function BrowseClient({ categories, initialRecipes }: Props) {
  const searchParams = useSearchParams()
  const urlCategory = searchParams.get('category') ?? 'all'
  const urlQuery = searchParams.get('q') ?? ''

  const validSlugs = useMemo(() => new Set(categories.map(c => c.slug)), [categories])
  const [activeCat, setActiveCat] = useState(
    urlCategory === 'all' || validSlugs.has(urlCategory) ? urlCategory : 'all'
  )
  const [sort, setSort] = useState<Sort>('default')
  const [layout, setLayout] = useState<Layout>('cover')
  const [lastRecipeSlug, setLastRecipeSlug] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<RecipeListItem[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Authenticated recipe list — SSR fetch uses the internal token so it
  // has no is_mine / owner data. We re-fetch on mount to overlay ownership
  // info. Cache the overlay in sessionStorage so repeat visits to /rezepte
  // skip the network round-trip and the chip + badges appear instantly.
  const [authedRecipes, setAuthedRecipes] = useState<RecipeListItem[] | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = sessionStorage.getItem('kb:rezepte-overlay:v1')
      if (!raw) return null
      const cached = JSON.parse(raw) as { items: RecipeListItem[]; meta: { my_recipe_count: number }; ts: number }
      if (Date.now() - cached.ts > 60_000) return null // 60s freshness
      return cached.items
    } catch { return null }
  })
  const [myRecipeCount, setMyRecipeCount] = useState(() => {
    if (typeof window === 'undefined') return 0
    try {
      const raw = sessionStorage.getItem('kb:rezepte-overlay:v1')
      if (!raw) return 0
      const cached = JSON.parse(raw) as { meta: { my_recipe_count: number }; ts: number }
      if (Date.now() - cached.ts > 60_000) return 0
      return cached.meta.my_recipe_count
    } catch { return 0 }
  })

  useEffect(() => {
    clientGetRecipes()
      .then(r => {
        setAuthedRecipes(r.items)
        setMyRecipeCount(r.meta.my_recipe_count)
        try {
          sessionStorage.setItem('kb:rezepte-overlay:v1', JSON.stringify({ items: r.items, meta: r.meta, ts: Date.now() }))
        } catch {}
      })
      .catch(() => {})
  }, [])

  // Sync category from URL (e.g. navigating from home page category cards)
  useEffect(() => {
    const cat = urlCategory === 'all' || validSlugs.has(urlCategory) ? urlCategory : 'all'
    setActiveCat(cat)
  }, [urlCategory, validSlugs])

  // Fetch search results from backend when ?q= changes
  useEffect(() => {
    if (!urlQuery) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    setSearchResults(null)
    clientGetRecipes({ q: urlQuery })
      .then(r => { setSearchResults(r.items); setIsSearching(false) })
      .catch(() => setIsSearching(false))
  }, [urlQuery])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('browseLayout')
      if (saved === 'cover' || saved === 'grid' || saved === 'list') setLayout(saved as Layout)
      setLastRecipeSlug(localStorage.getItem('last_recipe'))
    } catch {}
  }, [])

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

  useEffect(() => {
    const handle = () => {
      try { sessionStorage.setItem('rezepte-scroll-y', String(Math.round(window.scrollY))) } catch {}
    }
    window.addEventListener('scroll', handle, { passive: true })
    return () => window.removeEventListener('scroll', handle)
  }, [])

  const catMap = useMemo(
    () => Object.fromEntries(categories.map(c => [c.slug, c])),
    [categories]
  )

  const setLayoutPersist = useCallback((l: Layout) => {
    setLayout(l)
    try { localStorage.setItem('browseLayout', l) } catch {}
  }, [])

  const baseList = authedRecipes ?? initialRecipes

  const displayRecipes = useMemo(() => {
    if (searchResults !== null) return searchResults
    let r: RecipeListItem[]
    if (activeCat === MINE) {
      r = baseList.filter(x => x.is_mine)
    } else if (activeCat === 'all') {
      r = baseList
    } else {
      r = baseList.filter(x => x.category_slug === activeCat)
    }
    if (sort === 'time') r = [...r].sort((a, b) => a.time_minutes - b.time_minutes)
    if (sort === 'name') r = [...r].sort((a, b) => a.title.localeCompare(b.title, 'de'))
    return r
  }, [searchResults, activeCat, sort, baseList])

  const lastRecipe = lastRecipeSlug ? baseList.find(r => r.slug === lastRecipeSlug) ?? null : null

  // Mobile chip strip: "Meine Rezepte" right after "Alle".
  const chipDescriptors: { slug: string; name: string }[] = [{ slug: 'all', name: 'Alle' }]
  if (myRecipeCount > 0) chipDescriptors.push({ slug: MINE, name: 'Meine Rezepte' })
  chipDescriptors.push(...categories)

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block">
        <DesktopBrowse
          categories={categories}
          recipes={displayRecipes}
          activeCat={activeCat}
          setActiveCat={setActiveCat}
          sort={sort}
          setSort={setSort}
          searchQuery={urlQuery}
          lastRecipe={lastRecipe}
          myRecipeCount={myRecipeCount}
        />
      </div>

      {/* Mobile */}
      <div className="lg:hidden pb-6">
        <div className="px-5 pt-16 pb-1">
          {urlQuery ? (
            <>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>Suchergebnisse</p>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.5, lineHeight: 1.05 }}>„{urlQuery}"</h1>
            </>
          ) : (
            <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.5, lineHeight: 1.05 }}>
              {activeCat === MINE ? 'Meine Rezepte' : 'Rezepte'}
            </h1>
          )}
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
            {isSearching ? 'Suche…' : `${displayRecipes.length} ${displayRecipes.length === 1 || urlQuery ? 'Treffer' : 'Rezepte'}`}
          </p>
        </div>

        {!urlQuery && (
          <div className="scroll-snap-x flex gap-2 px-5 py-4">
            {chipDescriptors.map((c) => {
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
        )}

        {!urlQuery && (
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
        )}

        <div className="px-5">
          {(urlQuery || layout === 'list') && (
            <div className="flex flex-col gap-3">
              {displayRecipes.map((r, i) => <CardList key={r.slug} recipe={r} category={catMap[r.category_slug]} priority={i === 0} />)}
            </div>
          )}
          {!urlQuery && layout === 'grid' && (
            <div className="grid grid-cols-2 gap-3">
              {displayRecipes.map((r, i) => <CardGrid key={r.slug} recipe={r} category={catMap[r.category_slug]} priority={i === 0} />)}
            </div>
          )}
          {!urlQuery && layout === 'cover' && (
            <div className="grid grid-cols-2 gap-3">
              {displayRecipes.map((r, i) => <CardCover key={r.slug} recipe={r} category={catMap[r.category_slug]} priority={i === 0} />)}
            </div>
          )}
        </div>

        {lastRecipe && <FloatingLastRecipe recipe={lastRecipe} />}
      </div>
    </>
  )
}
