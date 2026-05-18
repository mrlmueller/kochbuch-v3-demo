'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clientCreateAIJob } from '@/lib/api'
import { prepareImageForUpload } from '@/lib/image-prep'

const MODEL_OPTIONS = [
  { provider: 'claude', model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Standard)' },
  { provider: 'openai', model: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { provider: 'openai', model: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
  { provider: 'claude', model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
]

const ADMIN_DEFAULT_MODEL = 'claude:claude-sonnet-4-6'
const USER_DEFAULT_MODEL = 'openai:gpt-5.4-mini'

export function AusBildClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [modelKey, setModelKey] = useState(isAdmin ? ADMIN_DEFAULT_MODEL : USER_DEFAULT_MODEL)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai_model_key')
      if (saved) setModelKey(saved)
    } catch {}
  }, [])

  async function uploadOne(rawFile: File) {
    setUploading(true)
    setError('')
    try {
      // iOS HEIC photos (especially ones with printed text) routinely blow
      // past the server's size limit. Normalize to JPEG <=2048px first.
      const file = await prepareImageForUpload(rawFile)
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Upload fehlgeschlagen')
      }
      const { url } = await res.json() as { url: string }
      setImages(prev => [...prev, url])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      const [provider, model] = modelKey.split(':')
      await clientCreateAIJob({
        image_urls: images,
        ...(isAdmin ? { provider, model } : {}),
      })
      // The uploaded images now belong to the queued job — drop them so the
      // form is empty when the user returns to start another extraction.
      setImages([])
      setError('')
      router.push('/neu')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 96px' }}>
      <style>{`
        .ab-spinner {
          width: 18px; height: 18px; border-radius: 50%;
          border: 2.5px solid var(--border); border-top-color: var(--accent);
          animation: ab-spin 0.7s linear infinite; flex-shrink: 0;
        }
        @keyframes ab-spin { to { transform: rotate(360deg); } }
      `}</style>
      <h1 style={{ fontSize: 28, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.4, margin: '0 0 8px' }}>Aus Bildern</h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>
        Eine Aufnahme reicht, mehrere Winkel helfen aber. Maximal 3 Bilder.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {images.map((url, i) => (
          <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: 'var(--card-bg)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        {images.length < 3 && (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ aspectRatio: '1', borderRadius: 12, border: '2px dashed var(--border)', background: uploading ? 'var(--card-bg)' : 'transparent', cursor: uploading ? 'wait' : 'pointer', color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
            {uploading
              ? <><span className="ab-spinner" /><span style={{ fontSize: 11, fontWeight: 600 }}>Lädt…</span></>
              : <span style={{ fontSize: 24 }}>+</span>}
          </button>
        )}
      </div>

      {uploading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text)', marginBottom: 16 }}>
          <span className="ab-spinner" />
          Bild wird verarbeitet und hochgeladen…
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => {
        const f = e.target.files?.[0]
        if (f) uploadOne(f)
        if (fileRef.current) fileRef.current.value = ''
      }} />

      {isAdmin && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>Modell wählen (Admin)</summary>
          <select value={modelKey} onChange={e => { setModelKey(e.target.value); try { localStorage.setItem('ai_model_key', e.target.value) } catch {} }}
            style={{ marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid var(--border)', width: '100%' }}>
            {MODEL_OPTIONS.map(o => <option key={`${o.provider}:${o.model}`} value={`${o.provider}:${o.model}`}>{o.label}</option>)}
          </select>
        </details>
      )}

      {error && <p style={{ color: '#B91C1C', fontSize: 13, margin: '12px 0' }}>{error}</p>}

      <button type="button" onClick={submit} disabled={images.length === 0 || submitting || uploading} style={{
        width: '100%', padding: '14px', borderRadius: 12, background: 'var(--accent)',
        color: 'white', border: 'none', fontSize: 16, fontWeight: 600,
        cursor: images.length === 0 || submitting || uploading ? 'not-allowed' : 'pointer',
        opacity: images.length === 0 || submitting || uploading ? 0.5 : 1,
      }}>
        {submitting ? 'Sende…' : uploading ? 'Bild lädt…' : 'Rezept erzeugen'}
      </button>
    </main>
  )
}
