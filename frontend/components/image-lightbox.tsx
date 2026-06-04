'use client'

import { useEffect, useState } from 'react'

// Closing animation is still being evaluated — flip this to false to compare an
// instant close against the animated one.
const ANIMATE_CLOSE = true
const EXIT_MS = 160

type Action = { label: string; onClick: () => void }

/**
 * Full-screen image viewer. Driven by a `src` state: non-null opens it,
 * backdrop / ✕ / Escape closes it. The image appears instantly; only the dark
 * backdrop fades in (via @starting-style, no JS). On close, the whole overlay
 * fades out before unmounting (toggleable via ANIMATE_CLOSE). An optional
 * `action` renders a button under the image — used by the review screen to
 * pick the enlarged source photo as the cover.
 */
export function ImageLightbox({
  src,
  onClose,
  action,
}: {
  src: string | null
  onClose: () => void
  action?: Action
}) {
  // Retain content while fading out so the image doesn't vanish mid-animation.
  const [shown, setShown] = useState<{ src: string; action?: Action } | null>(src ? { src, action } : null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (src) {
      setShown({ src, action })
      setClosing(false)
      return
    }
    if (!shown) return
    if (!ANIMATE_CLOSE) {
      setShown(null)
      return
    }
    setClosing(true)
    const t = setTimeout(() => { setShown(null); setClosing(false) }, EXIT_MS)
    return () => clearTimeout(t)
  }, [src, action]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [shown, onClose])

  if (!shown) return null
  const act = shown.action

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <style>{`
        .lb-bg { opacity: 1; transition: opacity 180ms ease-out; }
        @starting-style { .lb-bg { opacity: 0; } }
        .lb-bg.lb-closing { opacity: 0; }
        .lb-content { opacity: 1; transition: opacity ${EXIT_MS}ms ease-in; }
        .lb-content.lb-closing { opacity: 0; }
      `}</style>

      {/* Backdrop fades in on its own; the image stays instant. */}
      <div className={`lb-bg${closing ? ' lb-closing' : ''}`} style={{ position: 'absolute', inset: 0, background: 'rgba(10,6,2,0.9)' }} />

      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        style={{
          position: 'absolute', top: 14, right: 14, width: 40, height: 40, zIndex: 1,
          borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.16)',
          color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ✕
      </button>

      <div
        className={`lb-content${closing ? ' lb-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: '100%', maxHeight: '100%' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shown.src}
          alt=""
          style={{ maxWidth: '100%', maxHeight: act ? 'calc(100% - 64px)' : '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
        />
        {act && (
          <button
            type="button"
            onClick={act.onClick}
            style={{
              padding: '11px 20px', borderRadius: 999, border: 'none',
              background: '#C2410C', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {act.label}
          </button>
        )}
      </div>
    </div>
  )
}
