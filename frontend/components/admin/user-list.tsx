'use client'

import { useState, useMemo } from 'react'
import type { User } from '@/lib/api'
import { clientCreateUser, clientUpdateUser, clientDeleteUser } from '@/lib/api'

export function AdminUserList({ users: initial }: { users: User[] }) {
  const [users, setUsers] = useState(initial)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'deactivated'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [addError, setAddError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', surface: '#fff', danger: '#B91C1C', success: '#15803D', successBg: '#DCFCE7', warnBg: '#FEF3C7', warn: '#92400E' }

  const filtered = useMemo(() => {
    let r = users
    if (filter !== 'all') r = r.filter(u => u.status === filter)
    if (query.trim()) r = r.filter(u => u.email.toLowerCase().includes(query.toLowerCase()))
    return r
  }, [users, query, filter])

  const handleAdd = async () => {
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setAddError('Ungültige E-Mail'); return
    }
    try {
      const user = await clientCreateUser(newEmail.trim())
      setUsers(p => [user, ...p])
      setShowAdd(false); setNewEmail(''); setAddError('')
    } catch (e: unknown) { setAddError(e instanceof Error ? e.message : String(e)) }
  }

  const toggleStatus = async (u: User) => {
    const updated = await clientUpdateUser(u.id, { role: u.role, status: u.status === 'active' ? 'deactivated' : 'active' })
    setUsers(p => p.map(x => x.id === u.id ? updated : x))
  }

  const handleDelete = async (id: string) => {
    await clientDeleteUser(id)
    setUsers(p => p.filter(x => x.id !== id))
    setConfirmId(null)
  }

  const counts = { all: users.length, active: users.filter(u => u.status === 'active').length, deactivated: users.filter(u => u.status === 'deactivated').length }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 32, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, margin: 0 }}>Benutzer</h1>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{counts.active} aktiv · {counts.deactivated} deaktiviert</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Benutzer hinzufügen
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="E-Mail suchen…" style={{ flex: '1 1 240px', padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, fontSize: 14, fontFamily: 'inherit', color: T.text }} />
        <div style={{ display: 'flex', padding: 3, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, gap: 2 }}>
          {(['all', 'active', 'deactivated'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: filter === s ? T.accent : 'transparent', color: filter === s ? '#fff' : T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {s === 'all' ? `Alle (${counts.all})` : s === 'active' ? `Aktiv (${counts.active})` : `Deaktiviert (${counts.deactivated})`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1.2, textTransform: 'uppercase', background: '#FBF7F1' }}>
          <div>E-Mail</div><div>Status</div><div>Rolle</div><div>Erstellt</div><div />
        </div>
        {filtered.length === 0 && <p style={{ padding: 40, textAlign: 'center', color: T.muted }}>Keine Benutzer.</p>}
        {filtered.map((u, i) => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', alignItems: 'center', padding: '14px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}, #9A340A)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{u.email[0].toUpperCase()}</div>
              <span style={{ fontSize: 14, color: T.text }}>{u.email}</span>
            </div>
            <button onClick={() => toggleStatus(u)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, border: 'none', background: u.status === 'active' ? T.successBg : T.warnBg, color: u.status === 'active' ? T.success : T.warn, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.status === 'active' ? T.success : T.warn }} />
              {u.status === 'active' ? 'aktiv' : 'deaktiviert'}
            </button>
            <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>{u.role}</span>
            <span style={{ fontSize: 12, color: T.muted }}>{new Date(u.created_at).toLocaleDateString('de-DE')}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmId(u.id)} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add user modal */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(40,25,10,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h2 style={{ fontSize: 20, fontFamily: "'DM Serif Display', Georgia, serif", margin: '0 0 14px' }}>Neuer Benutzer</h2>
            <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Trage die E-Mail ein. Der Benutzer kann sich danach mit dieser Adresse anmelden.</p>
            <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setAddError('') }} onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus placeholder="benutzer@example.com" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: '#FAF6EF', fontSize: 15, fontFamily: 'inherit', color: T.text, boxSizing: 'border-box', marginBottom: addError ? 6 : 0 }} />
            {addError && <p style={{ color: T.danger, fontSize: 12, margin: '0 0 10px' }}>{addError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
              <button onClick={handleAdd} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Hinzufügen</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmId && (
        <div onClick={() => setConfirmId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(40,25,10,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h2 style={{ fontSize: 20, fontFamily: "'DM Serif Display', Georgia, serif", margin: '0 0 10px' }}>Benutzer löschen?</h2>
            <p style={{ fontSize: 14, color: T.muted, margin: '0 0 20px' }}>„{users.find(u => u.id === confirmId)?.email}" wird unwiderruflich entfernt.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmId(null)} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
              <button onClick={() => handleDelete(confirmId)} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.danger, color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Löschen</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
