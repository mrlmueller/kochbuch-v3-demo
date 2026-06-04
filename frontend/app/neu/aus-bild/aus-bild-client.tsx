'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clientCreateAIJob } from '@/lib/api'
import { prepareImageForUpload } from '@/lib/image-prep'
import { ImageLightbox } from '@/components/image-lightbox'

let _slotSeq = 0
const uid = () => `img-${Date.now().toString(36)}-${(_slotSeq += 1)}`

const MODEL_OPTIONS = [
  { provider: 'claude', model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Standard)' },
  { provider: 'openai', model: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { provider: 'openai', model: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
  { provider: 'claude', model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
]

const ADMIN_DEFAULT_MODEL = 'claude:claude-sonnet-4-6'
const USER_DEFAULT_MODEL = 'openai:gpt-5.4-mini'
const MAX_IMAGES = 6

type SlotStatus = 'uploading' | 'done' | 'error'

interface ImageSlot {
  id: string
  file: File
  previewUrl: string // local object URL — shown instantly, never flickers to remote
  status: SlotStatus
  url?: string // hosted URL once the upload finishes
}

export function AusBildClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [slots, setSlots] = useState<ImageSlot[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [modelKey, setModelKey] = useState(isAdmin ? ADMIN_DEFAULT_MODEL : USER_DEFAULT_MODEL)

  // Mirror slots into a ref so event handlers read fresh state without re-binding.
  const slotsRef = useRef<ImageSlot[]>(slots)
  useEffect(() => {
    slotsRef.current = slots
  })

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai_model_key')
      if (saved) setModelKey(saved)
    } catch {}
  }, [])

  // Free object URLs on unmount.
  useEffect(() => () => slotsRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl)), [])

  async function uploadOne(rawFile: File): Promise<string> {
    // iOS HEIC photos (especially ones with printed text) routinely blow past
    // the server's size limit. Normalize to JPEG <=2048px first.
    const file = await prepareImageForUpload(rawFile)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'Upload fehlgeschlagen')
    }
    const { url } = (await res.json()) as { url: string }
    return url
  }

  // Updates by id and tolerates a removed slot (find returns nothing → no-op).
  function patchSlot(id: string, patch: Partial<ImageSlot>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function startUpload(id: string, file: File) {
    uploadOne(file)
      .then((url) => patchSlot(id, { status: 'done', url }))
      .catch(() => patchSlot(id, { status: 'error' }))
  }

  function addFiles(rawFiles: File[]) {
    const remaining = MAX_IMAGES - slotsRef.current.length
    if (remaining <= 0) return
    const batch = rawFiles.slice(0, remaining)
    const newSlots: ImageSlot[] = batch.map((file) => ({
      id: uid(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'uploading',
    }))
    setSlots((prev) => [...prev, ...newSlots])
    // Fire every upload in parallel — no waiting for the previous one.
    newSlots.forEach((s) => startUpload(s.id, s.file))
  }

  function retry(id: string) {
    const slot = slotsRef.current.find((s) => s.id === id)
    if (!slot) return
    patchSlot(id, { status: 'uploading' })
    startUpload(id, slot.file)
  }

  function remove(id: string) {
    const slot = slotsRef.current.find((s) => s.id === id)
    if (slot) URL.revokeObjectURL(slot.previewUrl)
    setSlots((prev) => prev.filter((s) => s.id !== id))
  }

  const doneCount = slots.filter((s) => s.status === 'done').length
  const anyUploading = slots.some((s) => s.status === 'uploading')
  const canSubmit = doneCount > 0 && !anyUploading && !submitting

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const [provider, model] = modelKey.split(':')
      await clientCreateAIJob({
        image_urls: slots.filter((s) => s.status === 'done').map((s) => s.url!),
        ...(isAdmin ? { provider, model } : {}),
      })
      // The uploaded images now belong to the queued job — clear so the form is
      // empty when the user returns to start another extraction.
      slotsRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl))
      setSlots([])
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
        .ab-slot { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: var(--card-bg); }
        .ab-slot img { width: 100%; height: 100%; object-fit: cover; display: block; cursor: zoom-in; }
        .ab-overlay {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 8px; pointer-events: none;
        }
        .ab-retry { pointer-events: auto; }
        .ab-overlay-up { background: rgba(20,12,4,0.34); backdrop-filter: blur(1px); }
        .ab-overlay-err { background: rgba(120,12,4,0.5); }
        .ab-spinner-lg {
          width: 26px; height: 26px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.35); border-top-color: #fff;
          animation: ab-spin 0.7s linear infinite;
        }
        .ab-x {
          position: absolute; top: 5px; right: 5px; width: 26px; height: 26px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.55); color: #fff; border: none; border-radius: 50%;
          cursor: pointer; font-size: 13px; line-height: 1; z-index: 2;
        }
        .ab-retry {
          display: inline-flex; align-items: center; gap: 5px;
          background: rgba(255,255,255,0.95); color: #B91C1C; border: none; border-radius: 999px;
          padding: 5px 11px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .ab-add {
          aspect-ratio: 1; border-radius: 12px; border: 2px dashed var(--border);
          background: transparent; cursor: pointer; color: var(--muted);
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
          font-family: inherit; transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .ab-add:hover { border-color: var(--accent); color: var(--accent); background: var(--card-bg); }
        @keyframes ab-spin { to { transform: rotate(360deg); } }
      `}</style>

      <h1 style={{ fontSize: 28, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.4, margin: '0 0 8px' }}>Aus Bildern</h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>
        Eine Aufnahme reicht, mehrere Winkel helfen aber. Du kannst bis zu {MAX_IMAGES} Bilder hinzufügen — alle laden gleichzeitig, du musst nicht warten.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {slots.map((slot) => (
          <div key={slot.id} className="ab-slot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slot.previewUrl} alt="" onClick={() => setLightbox(slot.previewUrl)} />

            {slot.status === 'uploading' && (
              <div className="ab-overlay ab-overlay-up">
                <span className="ab-spinner-lg" aria-label="Lädt hoch" />
              </div>
            )}

            {slot.status === 'error' && (
              <div className="ab-overlay ab-overlay-err">
                <button type="button" className="ab-retry" onClick={() => retry(slot.id)}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-3-6.7" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  Erneut
                </button>
              </div>
            )}

            <button type="button" className="ab-x" onClick={() => remove(slot.id)} aria-label="Bild entfernen">✕</button>
          </div>
        ))}

        {slots.length < MAX_IMAGES && (
          <button type="button" className="ab-add" onClick={() => fileRef.current?.click()}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Bild</span>
          </button>
        )}
      </div>

      {slots.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '-6px 0 16px' }}>
          Tippe ein Bild an, um es größer anzusehen.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length) addFiles(files)
          if (fileRef.current) fileRef.current.value = ''
        }}
      />

      {isAdmin && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>Modell wählen (Admin)</summary>
          <select
            value={modelKey}
            onChange={(e) => { setModelKey(e.target.value); try { localStorage.setItem('ai_model_key', e.target.value) } catch {} }}
            style={{ marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid var(--border)', width: '100%' }}
          >
            {MODEL_OPTIONS.map((o) => <option key={`${o.provider}:${o.model}`} value={`${o.provider}:${o.model}`}>{o.label}</option>)}
          </select>
        </details>
      )}

      {error && <p style={{ color: '#B91C1C', fontSize: 13, margin: '12px 0' }}>{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, background: 'var(--accent)',
          color: 'white', border: 'none', fontSize: 16, fontWeight: 600,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: canSubmit ? 1 : 0.5,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        }}
      >
        {submitting && <span className="ab-spinner-lg" style={{ width: 18, height: 18, borderWidth: 2.5 }} />}
        {submitting ? 'Sende…' : anyUploading ? 'Bilder laden…' : 'Rezept erzeugen'}
      </button>

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </main>
  )
}
