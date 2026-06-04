'use client'

import { useEffect } from 'react'

/**
 * Full-screen image viewer. Render it once per screen and drive it with a
 * `src` state: a non-null src opens it, clicking the backdrop / ✕ / Escape
 * closes it. The image itself is contained (never cropped) so text photos
 * stay readable.
 */
export function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
      />
    </div>
  )
}
