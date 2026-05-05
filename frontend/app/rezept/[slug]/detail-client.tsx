'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import type { Recipe } from '@/lib/api'
import { BlurImage } from '@/components/blur-image'
import { IngredientList } from '@/components/ingredient-list'
import { StepList } from '@/components/step-list'

interface Props {
  recipe: Recipe
  categoryName: string
}

export function DetailClient({ recipe, categoryName }: Props) {
  // Screen wake lock — keep screen on while cooking
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let released = false
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock.request('screen')
      .then((l) => { if (released) { l.release(); return }; lock = l })
      .catch(() => {})
    return () => { released = true; lock?.release() }
  }, [])

  return (
    <div className="pb-10">
      {/* Back button + hero image */}
      <div className="relative" style={{ height: 460, background: 'var(--border)' }}>
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="100vw" priority blurhash={recipe.image_blurhash} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 35%, rgba(0,0,0,0.6) 100%)' }} />
        <Link href="/rezepte" scroll={false}
          className="absolute top-14 left-4 w-10 h-10 rounded-full flex items-center justify-center no-underline"
          style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </Link>
      </div>

      {/* Title block */}
      <div className="px-6 pt-7 pb-0 text-center">
        {categoryName && (
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
            — {categoryName} —
          </p>
        )}
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', lineHeight: 1.05, fontFamily: 'var(--font-serif)', letterSpacing: -0.6, marginBottom: 14 }}>
          {recipe.title}
        </h1>
        <div style={{ width: 32, height: 1, background: 'var(--accent)', margin: '0 auto 14px' }} />
      </div>

      {/* Meta row */}
      <div className="flex justify-center gap-8 px-5 py-6" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <div className="text-center">
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Zeit</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
            {recipe.time_minutes > 0 ? `${recipe.time_minutes} min` : '–'}
          </p>
        </div>
        {recipe.servings && (
          <>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div className="text-center">
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Personen</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
                {recipe.servings}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Ingredients section */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-4 mb-4">
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)' }}>Zutaten</p>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <IngredientList ingredients={recipe.ingredients} servingsRaw={recipe.servings} />
      </div>

      {/* Steps section */}
      <div className="px-6 py-2">
        <div className="flex items-center gap-4 mb-5">
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)' }}>Zubereitung</p>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <StepList steps={recipe.steps} />
      </div>

      {/* Notes/Tip */}
      {recipe.notes && (
        <div className="mx-6 mt-6 p-4 rounded-2xl flex gap-3"
          style={{ background: `color-mix(in srgb, var(--accent) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(--accent) 25%, transparent)` }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
            <path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.74V17h8v-2.26A7 7 0 0012 2z"/>
          </svg>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Tipp</p>
            <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
              {recipe.notes}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
