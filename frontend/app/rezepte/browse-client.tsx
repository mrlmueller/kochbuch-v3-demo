'use client'

import { useState, useEffect, useMemo } from 'react'
import type { Category, RecipeListItem } from '@/lib/api'
import { CardGrid, CardList, CardCover } from '@/components/recipe-card'

type Layout = 'grid' | 'list' | 'cover'

interface Props {
  categories: Category[]
  initialRecipes: RecipeListItem[]
  initialCategory: string
}

export function BrowseClient({ categories, initialRecipes, initialCategory }: Props) {
  const validSlugs = useMemo(() => new Set(categories.map((c) => c.slug)), [categories])
  const [activeCat, setActiveCat] = useState(
    initialCategory === 'all' || validSlugs.has(initialCategory) ? initialCategory : 'all'
  )
  const [layout, setLayout] = useState<Layout>('cover')

  useEffect(() => {
    const saved = localStorage.getItem('browseLayout')
    if (saved === 'cover' || saved === 'grid' || saved === 'list') setLayout(saved)
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

      {/* Layout toggle */}
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
