'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { clientListAIJobs, clientDeleteAIJob, type AIJob } from '@/lib/api'

export function PendingJobs({ dailyLimit }: { dailyLimit: number }) {
  const [jobs, setJobs] = useState<AIJob[]>([])
  const [used, setUsed] = useState(0)

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const { items, daily_used } = await clientListAIJobs()
        if (stop) return
        setJobs(items)
        setUsed(daily_used)
        const active = items.some(j => j.status === 'queued' || j.status === 'running')
        timer = setTimeout(tick, active ? 3000 : 15000)
      } catch {
        timer = setTimeout(tick, 10000)
      }
    }
    tick()
    return () => { stop = true; if (timer) clearTimeout(timer) }
  }, [])

  // Hide rows we'd never show.
  const visible = jobs.filter(j => j.status !== 'consumed')
  if (visible.length === 0 && used === 0) return null

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 12px' }}>
        In Bearbeitung
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(j => (
          <JobRow key={j.id} job={j} onCancel={async () => {
            try { await clientDeleteAIJob(j.id) } catch {}
            setJobs(prev => prev.filter(x => x.id !== j.id))
          }} />
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>
        Heute genutzt: {used} / {dailyLimit}
      </p>
    </section>
  )
}

function JobRow({ job, onCancel }: { job: AIJob; onCancel: () => void }) {
  const status = job.status
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'white' }}>
      <span style={{ fontSize: 18 }}>{statusIcon(status)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--text)' }}>{statusLabel(status)}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{job.image_urls.length} Bild(er) · {job.model}</div>
        {job.error && <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 2 }}>{job.error}</div>}
      </div>
      {status === 'ready' && (
        <Link href={`/neu/aus-bild/${job.id}/pruefen`} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Prüfen</Link>
      )}
      {(status === 'queued' || status === 'failed' || status === 'ready' || status === 'cancelled') && (
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
      )}
    </div>
  )
}

function statusIcon(s: AIJob['status']) {
  switch (s) {
    case 'queued': return '⏳'
    case 'running': return '⏳'
    case 'ready': return '✓'
    case 'failed': return '⚠'
    default: return '•'
  }
}
function statusLabel(s: AIJob['status']) {
  switch (s) {
    case 'queued': return 'In Warteschlange'
    case 'running': return 'Wird analysiert…'
    case 'ready': return 'Bereit zur Prüfung'
    case 'failed': return 'Fehlgeschlagen'
    case 'cancelled': return 'Abgebrochen'
    default: return s
  }
}
