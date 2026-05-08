'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Logo } from '@/components/logo'

export function DesktopHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [q, setQ] = useState('')

  const isHome = pathname === '/'
  const isBrowse = pathname.startsWith('/rezepte')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (q.trim()) router.push(`/rezepte?q=${encodeURIComponent(q.trim())}`)
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
        <form onSubmit={submit} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          borderRadius: 999, background: 'white', border: '1px solid var(--border)',
          minWidth: 280, color: 'var(--muted)',
        }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text" value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Rezept oder Zutat suchen…"
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--text)', fontFamily: 'inherit' }}
          />
          {q && (
            <button type="button" onClick={() => setQ('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
          )}
        </form>
      </div>
    </header>
  )
}
