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

type OwnerFilter = 'all' | 'global' | 'user'

const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', surface: '#fff', danger: '#B91C1C' }

export function AdminRecipeList({ recipes: initial, categories }: Props) {
  const router = useRouter()
  const [recipes, setRecipes] = useState(initial)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all')
  const [sort, setSort] = useState('name')
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.slug, c])), [categories])

  const filtered = useMemo(() => {
    let r = [...recipes]
    if (cat !== 'all') r = r.filter(x => x.category_slug === cat)
    if (ownerFilter === 'global') r = r.filter(x => !x.owner_id)
    else if (ownerFilter === 'user') r = r.filter(x => !!x.owner_id)
    if (query.trim()) {
      const q = query.toLowerCase()
      r = r.filter(x => x.title.toLowerCase().includes(q) || (x.owner_email ?? '').toLowerCase().includes(q))
    }
    if (sort === 'name') r.sort((a, b) => a.title.localeCompare(b.title))
    else if (sort === 'time') r.sort((a, b) => a.time_minutes - b.time_minutes)
    return r
  }, [recipes, query, cat, ownerFilter, sort])

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

  return (
    <>
      {/* Header */}
      <div className="adm-header">
        <div>
          <h1 style={{ fontSize: 28, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, lineHeight: 1.05, letterSpacing: -0.5, margin: 0 }}>Rezepte</h1>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{filtered.length} von {recipes.length}</p>
        </div>
        <Link href="/admin/neu" className="adm-cta">
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Neues Rezept
        </Link>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: T.danger, marginBottom: 16, fontSize: 13 }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Fehler schließen"
            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: T.danger, cursor: 'pointer', fontSize: 16, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>
      )}

      {/* Owner filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {(['all', 'global', 'user'] as OwnerFilter[]).map(f => (
          <button key={f} type="button" onClick={() => setOwnerFilter(f)} style={{
            padding: '7px 14px', borderRadius: 999, whiteSpace: 'nowrap',
            border: `1px solid ${ownerFilter === f ? T.accent : T.border}`,
            background: ownerFilter === f ? T.accent : 'transparent',
            color: ownerFilter === f ? '#fff' : T.text,
            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {f === 'all' ? 'Alle' : f === 'global' ? 'Global (Admin)' : 'Nutzer-Rezepte'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rezept oder Eigentümer suchen…"
          style={{ flex: '1 1 200px', minWidth: 0, padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, fontSize: 14, fontFamily: 'inherit', color: T.text }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={selStyle}>
          <option value="all">Alle Kategorien</option>
          {categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={selStyle}>
          <option value="name">Name A–Z</option>
          <option value="time">Zeit (kurz → lang)</option>
        </select>
      </div>

      {/* Desktop table */}
      <div className="adm-table">
        <div className="adm-row adm-head">
          <div /><div>Name</div><div>Kategorie</div><div>Eigentümer</div><div>Zeit</div><div style={{ textAlign: 'right' }}>Aktionen</div>
        </div>
        {filtered.length === 0 && <p style={{ padding: 40, textAlign: 'center', color: T.muted }}>Keine Rezepte gefunden.</p>}
        {filtered.map((r, i) => {
          const c = catMap[r.category_slug]
          return (
            <div key={r.slug} onClick={() => router.push(`/admin/${r.slug}`)} className="adm-row" style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: r.image_url ? `url(${r.image_url}) center/cover` : '#eee' }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: T.text, fontFamily: "'DM Serif Display', Georgia, serif", margin: 0 }}>{r.title}</p>
              {c && <span style={{ display: 'inline-block', justifySelf: 'start', padding: '3px 9px', borderRadius: 999, background: `${c.accent}20`, color: c.accent, fontSize: 11, fontWeight: 600 }}>{c.name}</span>}
              <p style={{ fontSize: 12, color: r.owner_email ? T.text : T.muted, margin: 0, fontStyle: r.owner_email ? 'normal' : 'italic' }}>{r.owner_email || 'Global'}</p>
              <p style={{ fontSize: 13, color: T.text, margin: 0 }}>{r.time_minutes} min</p>
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Link href={`/admin/${r.slug}`} style={iconBtnStyle(T.text)} aria-label="Bearbeiten">✎</Link>
                <button onClick={() => setConfirmSlug(r.slug)} style={iconBtnStyle(T.danger)} aria-label="Löschen">✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile card list */}
      <div className="adm-cards">
        {filtered.length === 0 && <p style={{ padding: 32, textAlign: 'center', color: T.muted }}>Keine Rezepte gefunden.</p>}
        {filtered.map(r => {
          const c = catMap[r.category_slug]
          return (
            <div key={r.slug} className="adm-card">
              <Link href={`/admin/${r.slug}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
                <div style={{ width: 56, height: 56, borderRadius: 10, background: r.image_url ? `url(${r.image_url}) center/cover` : '#eee', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: T.text, fontFamily: "'DM Serif Display', Georgia, serif", margin: '0 0 4px', lineHeight: 1.25 }}>{r.title}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {c && <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: `${c.accent}20`, color: c.accent, fontSize: 10, fontWeight: 600 }}>{c.name}</span>}
                    <span style={{ fontSize: 11, color: T.muted }}>{r.time_minutes} min</span>
                    <span style={{ fontSize: 11, color: r.owner_email ? T.text : T.muted, fontStyle: r.owner_email ? 'normal' : 'italic' }}>· {r.owner_email || 'Global'}</span>
                  </div>
                </div>
              </Link>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Link href={`/admin/${r.slug}`} style={iconBtnStyle(T.text)} aria-label="Bearbeiten">✎</Link>
                <button onClick={() => setConfirmSlug(r.slug)} style={iconBtnStyle(T.danger)} aria-label="Löschen">✕</button>
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

      <style>{`
        .adm-header {
          display: flex; justify-content: space-between; align-items: flex-end;
          margin-bottom: 24px; gap: 16px; flex-wrap: wrap;
        }
        .adm-cta {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 10px 16px; border-radius: 10px;
          background: #C2410C; color: #fff; font-size: 14px; font-weight: 600;
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(194,65,12,0.3);
        }
        .adm-table {
          background: #fff;
          border-radius: 14px;
          border: 1px solid rgba(120,90,60,0.16);
          overflow: hidden;
        }
        .adm-row {
          display: grid;
          grid-template-columns: 56px 2fr 1fr 1.2fr 80px 110px;
          align-items: center;
          padding: 12px 16px;
        }
        .adm-head {
          padding: 10px 16px;
          border-bottom: 1px solid rgba(120,90,60,0.16);
          font-size: 11px; font-weight: 700; color: #7A6B5A;
          letter-spacing: 1.2px; text-transform: uppercase;
          background: #FBF7F1;
        }
        .adm-cards { display: none; }

        @media (max-width: 768px) {
          .adm-table { display: none; }
          .adm-cards {
            display: flex; flex-direction: column; gap: 10px;
          }
          .adm-card {
            display: flex; gap: 10px;
            padding: 12px;
            background: #fff;
            border-radius: 14px;
            border: 1px solid rgba(120,90,60,0.16);
            align-items: center;
          }
          .adm-cta {
            padding: 9px 13px; font-size: 13px;
          }
        }
      `}</style>
    </>
  )
}

const selStyle: React.CSSProperties = { flex: '0 0 auto', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', fontSize: 14, fontFamily: 'inherit', color: '#2A1F14', cursor: 'pointer' }
const iconBtnStyle = (color: string): React.CSSProperties => ({ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', color, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textDecoration: 'none', fontFamily: 'inherit' })
