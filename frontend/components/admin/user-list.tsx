'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { User, UserDetail } from '@/lib/api'
import { clientCreateUser, clientUpdateUser, clientDeleteUser, clientGetUserDetail, clientSetUserAILimit, clientSendPasswordSetup } from '@/lib/api'

export function AdminUserList({ users: initial }: { users: User[] }) {
  const [users, setUsers] = useState(initial)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'deactivated'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newMethod, setNewMethod] = useState<'google' | 'password'>('google')
  const [addError, setAddError] = useState('')
  const [resendMsg, setResendMsg] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [limitDraft, setLimitDraft] = useState('')
  const [savingLimit, setSavingLimit] = useState(false)
  const [limitSaved, setLimitSaved] = useState(false)

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
      const user = await clientCreateUser(newEmail.trim(), newMethod)
      setUsers(p => [user, ...p])
      setShowAdd(false); setNewEmail(''); setNewMethod('google'); setAddError('')
    } catch (e: unknown) { setAddError(e instanceof Error ? e.message : String(e)) }
  }

  const toggleStatus = async (u: User) => {
    setPendingToggleId(u.id)
    setError('')
    try {
      const updated = await clientUpdateUser(u.id, { role: u.role, status: u.status === 'active' ? 'deactivated' : 'active' })
      setUsers(p => p.map(x => x.id === u.id ? updated : x))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Status konnte nicht geändert werden')
    } finally {
      setPendingToggleId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    setError('')
    try {
      await clientDeleteUser(id)
      setUsers(p => p.filter(x => x.id !== id))
      setConfirmId(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Benutzer konnte nicht gelöscht werden')
      setConfirmId(null)
    } finally {
      setDeleting(false)
    }
  }

  const openDetail = async (id: string) => {
    setDetailId(id)
    setDetail(null)
    setDetailError('')
    setLimitSaved(false)
    setResendMsg('')
    setDetailLoading(true)
    try {
      const d = await clientGetUserDetail(id)
      setDetail(d)
      setLimitDraft(String(d.ai_daily_limit))
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : 'Details konnten nicht geladen werden')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => { setDetailId(null); setDetail(null); setDetailError('') }

  const saveLimit = async () => {
    if (!detail) return
    const n = parseInt(limitDraft, 10)
    if (Number.isNaN(n) || n < 0 || n > 1000) {
      setDetailError('Limit muss eine Zahl zwischen 0 und 1000 sein.')
      return
    }
    setSavingLimit(true)
    setDetailError('')
    try {
      await clientSetUserAILimit(detail.user.id, n)
      setDetail({ ...detail, ai_daily_limit: n })
      setLimitSaved(true)
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : 'Limit konnte nicht gesetzt werden')
    } finally {
      setSavingLimit(false)
    }
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

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: T.danger, marginBottom: 16, fontSize: 13 }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Fehler schließen"
            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: T.danger, cursor: 'pointer', fontSize: 16, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>
      )}

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

      {/* Desktop table */}
      <div className="usr-table" style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1.2, textTransform: 'uppercase', background: '#FBF7F1' }}>
          <div>E-Mail</div><div>Status</div><div>Rolle</div><div>Erstellt</div><div />
        </div>
        {filtered.length === 0 && <p style={{ padding: 40, textAlign: 'center', color: T.muted }}>Keine Benutzer.</p>}
        {filtered.map((u, i) => (
          <div key={u.id} onClick={() => openDetail(u.id)} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', alignItems: 'center', padding: '14px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}, #9A340A)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{u.email[0].toUpperCase()}</div>
              <span style={{ fontSize: 14, color: T.text }}>{u.email}</span>
            </div>
            {u.role === 'admin' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: T.successBg, color: T.success, fontSize: 12, fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.success }} />
                aktiv
              </span>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); toggleStatus(u) }} disabled={pendingToggleId === u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, border: 'none', background: u.status === 'active' ? T.successBg : T.warnBg, color: u.status === 'active' ? T.success : T.warn, fontSize: 12, fontWeight: 600, cursor: pendingToggleId === u.id ? 'wait' : 'pointer', opacity: pendingToggleId === u.id ? 0.6 : 1, fontFamily: 'inherit' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.status === 'active' ? T.success : T.warn }} />
                {u.status === 'active' ? 'aktiv' : 'deaktiviert'}
              </button>
            )}
            <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>{u.role}</span>
            <span style={{ fontSize: 12, color: T.muted }}>{new Date(u.created_at).toLocaleDateString('de-DE')}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={(e) => { e.stopPropagation(); setConfirmId(u.id) }} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile card list */}
      <div className="usr-cards">
        {filtered.length === 0 && <p style={{ padding: 32, textAlign: 'center', color: T.muted }}>Keine Benutzer.</p>}
        {filtered.map(u => (
          <div key={u.id} className="usr-card" onClick={() => openDetail(u.id)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}, #9A340A)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{u.email[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, color: T.text, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {u.role === 'admin' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, background: T.successBg, color: T.success, fontSize: 11, fontWeight: 600 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.success }} />
                      admin
                    </span>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); toggleStatus(u) }} disabled={pendingToggleId === u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, border: 'none', background: u.status === 'active' ? T.successBg : T.warnBg, color: u.status === 'active' ? T.success : T.warn, fontSize: 11, fontWeight: 600, cursor: pendingToggleId === u.id ? 'wait' : 'pointer', opacity: pendingToggleId === u.id ? 0.6 : 1, fontFamily: 'inherit' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: u.status === 'active' ? T.success : T.warn }} />
                      {u.status === 'active' ? 'aktiv' : 'deaktiviert'}
                    </button>
                  )}
                  <span style={{ fontSize: 11, color: T.muted }}>{new Date(u.created_at).toLocaleDateString('de-DE')}</span>
                </div>
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setConfirmId(u.id) }} aria-label="Löschen" style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>

      <style>{`
        .usr-cards { display: none; }
        @media (max-width: 768px) {
          .usr-table { display: none; }
          .usr-cards {
            display: flex; flex-direction: column; gap: 10px;
          }
          .usr-card {
            display: flex; gap: 10px;
            padding: 12px;
            background: #fff;
            border-radius: 14px;
            border: 1px solid rgba(120,90,60,0.16);
            align-items: center;
          }
        }
      `}</style>

      {/* Add user modal */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(40,25,10,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h2 style={{ fontSize: 20, fontFamily: "'DM Serif Display', Georgia, serif", margin: '0 0 14px' }}>Neuer Benutzer</h2>
            <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Trage die E-Mail ein. Der Benutzer kann sich danach mit dieser Adresse anmelden.</p>
            <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setAddError('') }} onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus placeholder="benutzer@example.com" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: '#FAF6EF', fontSize: 15, fontFamily: 'inherit', color: T.text, boxSizing: 'border-box', marginBottom: addError ? 6 : 0 }} />
            {addError && <p style={{ color: T.danger, fontSize: 12, margin: '0 0 10px' }}>{addError}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {(['google', 'password'] as const).map(m => (
                <button key={m} type="button" onClick={() => setNewMethod(m)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${newMethod === m ? T.accent : T.border}`, background: newMethod === m ? T.accent : T.surface, color: newMethod === m ? '#fff' : T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {m === 'google' ? 'Google-Login' : 'E-Mail + Passwort'}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: T.muted, margin: '8px 0 0' }}>
              {newMethod === 'google'
                ? 'Der Benutzer meldet sich mit Google an.'
                : 'Der Benutzer erhält eine E-Mail, um ein Passwort zu setzen.'}
            </p>
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
              <button onClick={() => setConfirmId(null)} disabled={deleting} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1, fontFamily: 'inherit' }}>Abbrechen</button>
              <button onClick={() => handleDelete(confirmId)} disabled={deleting} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.danger, color: '#fff', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1, fontFamily: 'inherit' }}>{deleting ? 'Lösche…' : 'Löschen'}</button>
            </div>
          </div>
        </div>
      )}

      {/* User detail */}
      {detailId && (
        <div onClick={closeDetail} style={{ position: 'fixed', inset: 0, background: 'rgba(40,25,10,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, padding: 24, maxWidth: 460, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            {detailLoading && <p style={{ fontSize: 14, color: T.muted, margin: 0 }}>Lädt…</p>}
            {detailError && <p style={{ fontSize: 13, color: T.danger, margin: '0 0 12px' }}>{detailError}</p>}
            {detail && (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
                  <h2 style={{ fontSize: 19, fontFamily: "'DM Serif Display', Georgia, serif", margin: 0, wordBreak: 'break-word' }}>{detail.user.email}</h2>
                  <button onClick={closeDetail} aria-label="Schließen" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface, color: T.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
                </div>
                <p style={{ fontSize: 12, color: T.muted, margin: '0 0 4px' }}>
                  {detail.user.role} · {detail.user.status === 'active' ? 'aktiv' : 'deaktiviert'}
                </p>
                <p style={{ fontSize: 12, color: T.muted, margin: '0 0 18px' }}>
                  Zuletzt aktiv: {detail.user.last_active_at
                    ? new Date(detail.user.last_active_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
                    : '—'}
                </p>

                {detail.user.auth_method === 'password' && (
                  <div style={{ marginBottom: 18 }}>
                    <button onClick={async () => { setResendMsg(''); try { await clientSendPasswordSetup(detail.user.email); setResendMsg('Einladung gesendet.') } catch { setResendMsg('Einladung gesendet.') } }}
                      style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Passwort-Einladung erneut senden
                    </button>
                    {resendMsg && <span style={{ fontSize: 12, color: T.success, marginLeft: 10 }}>{resendMsg}</span>}
                  </div>
                )}

                <div style={{ padding: 14, borderRadius: 12, background: '#FBF7F1', border: `1px solid ${T.border}`, marginBottom: 18 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.muted, margin: '0 0 6px' }}>KI-Rezepte heute</p>
                  <p style={{ fontSize: 22, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, margin: '0 0 10px' }}>
                    {detail.ai_used_today} <span style={{ fontSize: 14, color: T.muted }}>/ {detail.ai_daily_limit}</span>
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, color: T.muted }}>Limit heute</label>
                    <input type="number" value={limitDraft} min={0} max={1000}
                      onChange={e => { setLimitDraft(e.target.value); setLimitSaved(false) }}
                      style={{ width: 76, padding: '7px 9px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 14, fontFamily: 'inherit', color: T.text }} />
                    <button onClick={saveLimit} disabled={savingLimit} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: savingLimit ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: savingLimit ? 0.7 : 1 }}>
                      {savingLimit ? 'Speichert…' : 'Speichern'}
                    </button>
                    {limitSaved && <span style={{ fontSize: 12, color: T.success, fontWeight: 600 }}>✓ gesetzt</span>}
                  </div>
                  <p style={{ fontSize: 11, color: T.muted, margin: '8px 0 0' }}>Gilt nur für heute — setzt sich morgen automatisch zurück.</p>
                </div>

                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.muted, margin: '0 0 8px' }}>
                  Rezepte ({detail.recipe_count})
                </p>
                {detail.recipes.length === 0 ? (
                  <p style={{ fontSize: 13, color: T.muted, fontStyle: 'italic', margin: 0 }}>Noch keine Rezepte erstellt.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 240, overflowY: 'auto' }}>
                    {detail.recipes.map(r => (
                      <Link key={r.slug} href={`/admin/${r.slug}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, textDecoration: 'none', color: T.text, fontSize: 13.5 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                        <span style={{ color: T.muted, fontSize: 12, flexShrink: 0 }}>{r.owner_id ? 'privat' : 'global'}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
