'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { RecipeListItem, Category } from '@/lib/api'
import { clientDeleteRecipe } from '@/lib/api'

interface Props {
  recipes: RecipeListItem[]
  categories: Category[]
}

export function AdminRecipeList({ recipes: initial, categories }: Props) {
  const router = useRouter()
  const [recipes, setRecipes] = useState(initial)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')
  const [sort, setSort] = useState('name')
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.slug, c])), [categories])

  const filtered = useMemo(() => {
    let r = [...recipes]
    if (cat !== 'all') r = r.filter(x => x.category_slug === cat)
    if (query.trim()) {
      const q = query.toLowerCase()
      r = r.filter(x => x.title.toLowerCase().includes(q))
    }
    if (sort === 'name') r.sort((a, b) => a.title.localeCompare(b.title))
    else if (sort === 'time') r.sort((a, b) => a.time_minutes - b.time_minutes)
    return r
  }, [recipes, query, cat, sort])

  const handleDelete = async (slug: string) => {
    setDeleting(true)
    setError('')
    try {
      await clientDeleteRecipe(slug)
      setRecipes(r => r.filter(x => x.slug !== slug))
      setConfirmSlug(null)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Rezept konnte nicht gelöscht werden')
      setConfirmSlug(null)
    } finally {
      setDeleting(false)
    }
  }

  const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', surface: '#fff', danger: '#B91C1C' }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 32, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, lineHeight: 1.05, letterSpacing: -0.5, margin: 0 }}>Rezepte</h1>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{filtered.length} von {recipes.length}</p>
        </div>
        <Link href="/admin/neu" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          borderRadius: 10, background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600,
          textDecoration: 'none', boxShadow: '0 1px 3px rgba(194,65,12,0.3)',
        }}>+ Neues Rezept</Link>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: T.danger, marginBottom: 16, fontSize: 13 }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Fehler schließen"
            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: T.danger, cursor: 'pointer', fontSize: 16, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rezept suchen…"
          style={{ flex: '1 1 240px', padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, fontSize: 14, fontFamily: 'inherit', color: T.text }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={selStyle}>
          <option value="all">Alle Kategorien</option>
          {categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={selStyle}>
          <option value="name">Name A–Z</option>
          <option value="time">Zeit (kurz → lang)</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px 2fr 1fr 80px 110px', padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1.2, textTransform: 'uppercase', background: '#FBF7F1' }}>
          <div /><div>Name</div><div>Kategorie</div><div>Zeit</div><div style={{ textAlign: 'right' }}>Aktionen</div>
        </div>
        {filtered.length === 0 && <p style={{ padding: 40, textAlign: 'center', color: T.muted }}>Keine Rezepte gefunden.</p>}
        {filtered.map((r, i) => {
          const c = catMap[r.category_slug]
          return (
            <div key={r.slug} onClick={() => router.push(`/admin/${r.slug}`)} style={{ display: 'grid', gridTemplateColumns: '56px 2fr 1fr 80px 110px', alignItems: 'center', padding: '12px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: r.image_url ? `url(${r.image_url}) center/cover` : '#eee' }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: T.text, fontFamily: "'DM Serif Display', Georgia, serif", margin: 0 }}>{r.title}</p>
              {c && <span style={{ display: 'inline-block', justifySelf: 'start', padding: '3px 9px', borderRadius: 999, background: `${c.accent}20`, color: c.accent, fontSize: 11, fontWeight: 600 }}>{c.name}</span>}
              <p style={{ fontSize: 13, color: T.text, margin: 0 }}>{r.time_minutes} min</p>
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Link href={`/admin/${r.slug}`} style={iconBtnStyle(T.text)}>✎</Link>
                <button onClick={() => setConfirmSlug(r.slug)} style={iconBtnStyle(T.danger)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirm delete modal */}
      {confirmSlug && (
        <div onClick={() => setConfirmSlug(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(40,25,10,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h2 style={{ fontSize: 20, fontFamily: "'DM Serif Display', Georgia, serif", margin: '0 0 10px' }}>Rezept löschen?</h2>
            <p style={{ fontSize: 14, color: T.muted, margin: '0 0 20px' }}>„{recipes.find(r => r.slug === confirmSlug)?.title}" wird unwiderruflich entfernt.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmSlug(null)} disabled={deleting} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1, fontFamily: 'inherit' }}>Abbrechen</button>
              <button onClick={() => handleDelete(confirmSlug)} disabled={deleting} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.danger, color: '#fff', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1, fontFamily: 'inherit' }}>{deleting ? 'Lösche…' : 'Löschen'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const selStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', fontSize: 14, fontFamily: 'inherit', color: '#2A1F14', cursor: 'pointer' }
const iconBtnStyle = (color: string): React.CSSProperties => ({ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', color, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textDecoration: 'none', fontFamily: 'inherit' })
