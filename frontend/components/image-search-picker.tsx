'use client'

import { useEffect, useRef, useState } from 'react'
import { clientImageSearch, type ImageSearchResult } from '@/lib/api'

const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', bg: '#FAF6EF', danger: '#B91C1C' }

interface Props {
  open: boolean
  initialQuery: string
  onClose: () => void
  onPick: (url: string) => void
}

export function ImageSearchPicker({ open, initialQuery, onClose, onPick }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<ImageSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setResults([])
      setError('')
      setHasSearched(false)
      setTimeout(() => inputRef.current?.focus(), 50)
      if (initialQuery.trim()) {
        runSearch(initialQuery)
      }
    }
  }, [open, initialQuery])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const runSearch = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    setHasSearched(true)
    try {
      const items = await clientImageSearch(trimmed)
      setResults(items)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Suche fehlgeschlagen')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Re-host the picked image on Cloudinary so the recipe doesn't break when
  // the source page disappears. The /api/upload endpoint accepts { url }.
  const pickAndRehost = async (url: string) => {
    setPicking(url)
    setError('')
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Upload fehlgeschlagen (${res.status})`)
      }
      const { url: hosted } = await res.json() as { url: string }
      onPick(hosted)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bild konnte nicht übernommen werden')
    } finally {
      setPicking(null)
    }
  }

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,12,4,0.55)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: '92vh',
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.25)',
        }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 16px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <h2 style={{ flex: 1, fontSize: 18, fontWeight: 600, color: T.text, margin: 0 }}>Bild suchen</h2>
            <button type="button" onClick={onClose}
              style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: T.bg, cursor: 'pointer', fontSize: 18, color: T.text }}>
              ✕
            </button>
          </div>
          {/* No nested <form>: the picker is mounted inside the recipe form.
              Enter on the input triggers a search via onKeyDown. */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(query) } }}
              placeholder="z. B. Spaghetti Carbonara"
              style={{
                flex: 1, padding: '11px 14px', borderRadius: 10,
                border: `1px solid ${T.border}`, background: T.bg, fontSize: 15,
                color: T.text, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button type="button" onClick={() => runSearch(query)} disabled={loading || !query.trim()}
              style={{
                padding: '11px 18px', borderRadius: 10, border: 'none',
                background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer', opacity: loading || !query.trim() ? 0.6 : 1,
                fontFamily: 'inherit',
              }}>
              {loading ? '…' : 'Suchen'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: '#FEE2E2', color: T.danger, fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {loading && results.length === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: '1', borderRadius: 10, background: T.bg, animation: 'pulse 1.4s ease-in-out infinite' }} />
              ))}
            </div>
          )}

          {!loading && hasSearched && results.length === 0 && !error && (
            <p style={{ textAlign: 'center', color: T.muted, padding: 24, fontSize: 14 }}>
              Keine Bilder gefunden. Anderen Suchbegriff probieren?
            </p>
          )}

          {results.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {results.map((r, i) => {
                const busy = picking === r.url
                const disabled = picking !== null
                return (
                  <button
                    key={`${r.url}-${i}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickAndRehost(r.url)}
                    style={{
                      position: 'relative', aspectRatio: '1', borderRadius: 10,
                      overflow: 'hidden', border: `1px solid ${T.border}`,
                      padding: 0, cursor: disabled ? 'wait' : 'pointer', background: T.bg,
                      opacity: disabled && !busy ? 0.4 : 1,
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.thumb || r.url}
                      alt={r.title}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                    {busy && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, color: T.text,
                      }}>
                        Wird übernommen…
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>
    </div>
  )
}
