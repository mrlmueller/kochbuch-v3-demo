'use client'

import { useEffect, useState } from 'react'
import { clientGetAIStats, type AIStats, type AIStatsBucket } from '@/lib/api'

const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', surface: '#fff' }

function fmtUSD(v: number): string {
  return '$' + v.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}
function fmtInt(v: number): string {
  return v.toLocaleString('de-DE')
}

export function KostenClient() {
  const [stats, setStats] = useState<AIStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    clientGetAIStats()
      .then(s => { if (!cancelled) setStats(s) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])

  if (error) return <p style={{ color: '#B91C1C', padding: 24 }}>{error}</p>
  if (!stats) return <p style={{ color: T.muted, padding: 24 }}>Lädt…</p>

  return (
    <>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, margin: 0 }}>KI-Kosten</h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
          Verbrauch pro Modell und Nutzer. Stand: {new Date(stats.generated_at).toLocaleString('de-DE')}.
        </p>
      </header>

      {/* Summary cards */}
      <div className="kosten-summary">
        <SummaryCard title="Gesamt" bucket={stats.totals} />
        <SummaryCard title="Letzte 30 Tage" bucket={stats.last_30d} />
        <SummaryCard title="Letzte 7 Tage" bucket={stats.last_7d} />
      </div>

      {/* By model */}
      <Section title="Nach Modell">
        {stats.by_model.length === 0 ? (
          <Empty>Noch keine erfolgreichen Generierungen.</Empty>
        ) : (
          <div className="kosten-table-wrap">
            <table className="kosten-table">
              <thead>
                <tr><th>Modell</th><th>Jobs</th><th>Input-Tokens</th><th>Output-Tokens</th><th>Kosten</th></tr>
              </thead>
              <tbody>
                {stats.by_model.map(m => (
                  <tr key={`${m.provider}:${m.model}`}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.provider}:{m.model}</span></td>
                    <td>{fmtInt(m.jobs)}</td>
                    <td>{fmtInt(m.input_tokens)}</td>
                    <td>{fmtInt(m.output_tokens)}</td>
                    <td style={{ fontWeight: 600 }}>{fmtUSD(m.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* By user */}
      <Section title="Nach Nutzer">
        {stats.by_user.length === 0 ? (
          <Empty>Noch keine Nutzung.</Empty>
        ) : (
          <div className="kosten-table-wrap">
            <table className="kosten-table">
              <thead>
                <tr><th>Nutzer</th><th>Jobs</th><th>Kosten</th><th>Zuletzt</th></tr>
              </thead>
              <tbody>
                {stats.by_user.map(u => (
                  <tr key={u.user_id}>
                    <td style={{ wordBreak: 'break-all' }}>{u.email || '—'}</td>
                    <td>{fmtInt(u.jobs)}</td>
                    <td style={{ fontWeight: 600 }}>{fmtUSD(u.cost_usd)}</td>
                    <td style={{ fontSize: 12, color: T.muted }}>{u.last_used_at ? new Date(u.last_used_at).toLocaleString('de-DE') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Recent */}
      <Section title="Letzte Generierungen">
        {stats.recent.length === 0 ? (
          <Empty>Noch keine Generierungen.</Empty>
        ) : (
          <div className="kosten-table-wrap">
            <table className="kosten-table">
              <thead>
                <tr><th>Zeit</th><th>Nutzer</th><th>Modell</th><th>Status</th><th>Tokens (in/out)</th><th>Kosten</th></tr>
              </thead>
              <tbody>
                {stats.recent.map(r => (
                  <tr key={r.job_id}>
                    <td style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('de-DE')}</td>
                    <td style={{ fontSize: 12, wordBreak: 'break-all' }}>{r.user_email || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.provider}:{r.model}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtInt(r.input_tokens)} / {fmtInt(r.output_tokens)}</td>
                    <td style={{ fontWeight: 600 }}>{fmtUSD(r.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <style>{`
        .kosten-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 28px;
        }
        .kosten-card {
          background: #fff;
          border: 1px solid ${T.border};
          border-radius: 14px;
          padding: 16px 18px;
        }
        .kosten-table-wrap {
          background: #fff;
          border: 1px solid ${T.border};
          border-radius: 14px;
          overflow-x: auto;
        }
        .kosten-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .kosten-table th,
        .kosten-table td {
          padding: 10px 14px;
          text-align: left;
          border-bottom: 1px solid ${T.border};
        }
        .kosten-table th {
          font-size: 11px;
          font-weight: 700;
          color: ${T.muted};
          letter-spacing: 1.2px;
          text-transform: uppercase;
          background: #FBF7F1;
        }
        .kosten-table tr:last-child td { border-bottom: none; }

        @media (max-width: 768px) {
          .kosten-summary {
            grid-template-columns: 1fr;
          }
          .kosten-table th,
          .kosten-table td {
            padding: 8px 10px;
          }
        }
      `}</style>
    </>
  )
}

function SummaryCard({ title, bucket }: { title: string; bucket: AIStatsBucket }) {
  return (
    <div className="kosten-card">
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.muted, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, lineHeight: 1, marginBottom: 6 }}>
        {fmtUSD(bucket.cost_usd)}
      </div>
      <div style={{ fontSize: 12, color: T.muted }}>
        {fmtInt(bucket.success_jobs)} erfolgreich
        {bucket.failed_jobs > 0 && <> · {fmtInt(bucket.failed_jobs)} Fehler</>}
        <br />
        {fmtInt(bucket.input_tokens)} in / {fmtInt(bucket.output_tokens)} out Tokens
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.muted, margin: '0 0 10px' }}>{title}</h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ padding: 24, textAlign: 'center', color: T.muted, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, fontSize: 13 }}>{children}</p>
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    queued:    { bg: '#FEF3C7', fg: '#92400E', label: 'Wartet' },
    running:   { bg: '#DBEAFE', fg: '#1E3A8A', label: 'Läuft' },
    ready:     { bg: '#DCFCE7', fg: '#15803D', label: 'Bereit' },
    consumed:  { bg: '#DCFCE7', fg: '#15803D', label: 'Gespeichert' },
    failed:    { bg: '#FEE2E2', fg: '#B91C1C', label: 'Fehler' },
    cancelled: { bg: '#E5E7EB', fg: '#4B5563', label: 'Abgebrochen' },
  }
  const s = map[status] ?? { bg: '#E5E7EB', fg: '#4B5563', label: status }
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</span>
  )
}
