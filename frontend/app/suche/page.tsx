'use client'

import { useState, useEffect } from 'react'
import { clientGetRecipes as getRecipes } from '@/lib/api'
import type { RecipeListItem } from '@/lib/api'
import { CardList } from '@/components/recipe-card'

const SUGGESTIONS = ['Tomaten', 'Pasta', 'Schokolade', 'schnell', 'Knoblauch', 'Hähnchen']

export default function SuchePage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecipeListItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setIsSearching(false)
      setHasError(false)
      return
    }

    setIsSearching(true)
    setHasError(false)
    setResults([])

    const timer = setTimeout(async () => {
      try {
        const data = await getRecipes({ q })
        setResults(data)
      } catch {
        setHasError(true)
      } finally {
        setIsSearching(false)
      }
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
            <button type="button" onClick={() => setQuery('')} className="text-lg leading-none cursor-pointer bg-transparent border-none p-0"
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
                <button key={s} type="button" onClick={() => setQuery(s)}
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
              {isSearching ? 'Suche…' : hasError ? 'Fehler beim Suchen.' : `${results.length} Treffer`}
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
