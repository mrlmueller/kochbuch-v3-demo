'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { RecipeListItem } from '@/lib/api'
import { BlurImage } from '@/components/blur-image'

export function FloatingLastRecipe({ recipe }: { recipe: RecipeListItem }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let raf: number
    const tick = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0
      setShow(y > 280)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <Link href={`/rezept/${recipe.slug}`} className="floating-last-recipe" style={{
      position: 'fixed', left: '50%',
      transform: `translateX(-50%) translateY(${show ? 0 : 80}px)`,
      opacity: show ? 1 : 0,
      transition: 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.25s',
      pointerEvents: show ? 'auto' : 'none',
      zIndex: 60, cursor: 'pointer', textDecoration: 'none',
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '10px 22px 10px 10px', borderRadius: 999,
      background: 'white',
      border: '1px solid var(--border)',
      boxShadow: '0 10px 40px rgba(80,50,20,0.18), 0 2px 6px rgba(80,50,20,0.08)',
      maxWidth: 420,
    }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, position: 'relative', overflow: 'hidden', background: 'var(--border)' }}>
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="44px" blurhash={recipe.image_blurhash} />
        )}
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--accent)' }}>
          Zuletzt geöffnet
        </div>
        <div style={{ fontSize: 14, fontFamily: 'var(--font-serif)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
          {recipe.title}
        </div>
      </div>
      <div style={{ color: 'var(--accent)', marginLeft: 4, display: 'flex' }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 5l7 7-7 7"/>
        </svg>
      </div>
      <style>{`
        /* Desktop: tab bar is hidden, sit close to the bottom edge. */
        .floating-last-recipe { bottom: 28px; }
        /* Mobile (<1024px): clear the bottom tab bar + the device safe-area. */
        @media (max-width: 1023px) {
          .floating-last-recipe {
            bottom: calc(env(safe-area-inset-bottom, 12px) + 72px);
          }
        }
      `}</style>
    </Link>
  )
}
