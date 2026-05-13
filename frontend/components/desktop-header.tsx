'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Logo } from '@/components/logo'
import { useRecipeSearch } from '@/hooks/use-recipe-search'

export function DesktopHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const { results } = useRecipeSearch(focused ? q : '')
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isHome = pathname === '/'
  const isBrowse = pathname.startsWith('/rezepte')

  const showDropdown = focused && q.trim().length >= 1 && results.length > 0

  const handleBlur = () => {
    // Delay so a click on a result registers before closing.
    blurTimer.current = setTimeout(() => setFocused(false), 150)
  }

  const handleFocus = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    setFocused(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQ('')
      setFocused(false)
      e.currentTarget.blur()
    }
    if (e.key === 'Enter' && q.trim()) {
      setFocused(false)
      router.push(`/suche?q=${encodeURIComponent(q.trim())}`)
    }
  }

  const nav = [
    { href: '/', label: 'Entdecken', active: isHome },
    { href: '/rezepte', label: 'Rezepte', active: isBrowse },
  ]

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(250,246,239,0.92)',
      backdropFilter: 'blur(16px) saturate(180%)',
      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        maxWidth: 1320, margin: '0 auto', padding: '0 40px',
        height: 72, display: 'flex', alignItems: 'center', gap: 40,
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={30} />
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--muted)' }}>Mein</span>
            <span style={{ fontSize: 22, fontFamily: 'var(--font-serif)', color: 'var(--text)', letterSpacing: -0.4, lineHeight: 1 }}>Kochbuch</span>
          </span>
        </Link>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 4 }}>
          {nav.map(n => (
            <Link key={n.href} href={n.href} style={{
              textDecoration: 'none', padding: '8px 14px',
              fontSize: 14.5, color: n.active ? 'var(--text)' : 'var(--muted)',
              fontWeight: n.active ? 600 : 500,
              position: 'relative', borderRadius: 8,
            }}>
              {n.label}
              {n.active && <div style={{
                position: 'absolute', bottom: -13, left: 14, right: 14, height: 2,
                background: 'var(--accent)', borderRadius: 2,
              }} />}
            </Link>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
            borderRadius: showDropdown ? '16px 16px 0 0' : 999,
            background: 'white',
            border: '1px solid var(--border)',
            borderBottom: showDropdown ? 'none' : '1px solid var(--border)',
            minWidth: 280, color: 'var(--muted)',
            transition: 'border-radius 0.1s',
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="Rezept oder Zutat suchen…"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--text)', fontFamily: 'inherit' }}
            />
            {q && (
              <button type="button" onClick={() => { setQ(''); setFocused(false) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
            )}
          </div>

          {showDropdown && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: 'white',
              border: '1px solid var(--border)', borderTop: 'none',
              borderRadius: '0 0 16px 16px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
              zIndex: 100,
            }}>
              {results.slice(0, 6).map((recipe, i) => (
                <Link
                  key={recipe.slug}
                  href={`/rezepte/${recipe.slug}`}
                  onClick={() => { setQ(''); setFocused(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                    textDecoration: 'none',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipe.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{recipe.category_slug}</span>
                </Link>
              ))}
              {results.length > 6 && (
                <Link
                  href={`/suche?q=${encodeURIComponent(q.trim())}`}
                  onClick={() => { setQ(''); setFocused(false) }}
                  style={{
                    display: 'block', padding: '10px 14px',
                    textDecoration: 'none', fontSize: 13,
                    color: 'var(--accent)', fontWeight: 500,
                    borderTop: '1px solid var(--border)',
                    textAlign: 'center',
                  }}
                >
                  Alle {results.length} Treffer anzeigen →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
