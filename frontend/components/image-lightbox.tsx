'use client'

import { useEffect } from 'react'

/**
 * Full-screen image viewer. Render it once per screen and drive it with a
 * `src` state: a non-null src opens it, clicking the backdrop / ✕ / Escape
 * closes it. The image is contained (never cropped) so text photos stay
 * readable. An optional `action` renders a button under the image — used by
 * the review screen to pick the enlarged source photo as the cover.
 */
export function ImageLightbox({
  src,
  onClose,
  action,
}: {
  src: string | null
  onClose: () => void
  action?: { label: string; onClick: () => void }
}) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [src, onClose])

  if (!src) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(10,6,2,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        style={{
          position: 'absolute', top: 14, right: 14, width: 40, height: 40,
          borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.16)',
          color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ✕
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: '100%', maxHeight: '100%' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          style={{ maxWidth: '100%', maxHeight: action ? 'calc(100% - 64px)' : '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
        />
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            style={{
              padding: '11px 20px', borderRadius: 999, border: 'none',
              background: '#C2410C', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
