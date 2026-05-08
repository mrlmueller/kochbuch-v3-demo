'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Recipe } from '@/lib/api'
import { BlurImage } from '@/components/blur-image'
import { IngredientList } from '@/components/ingredient-list'
import { StepList } from '@/components/step-list'
import { formatIngredientAmount, parseServings } from '@/lib/utils'
import { PersistLastRecipe } from '@/components/persist-last-recipe'

const MOBILE_HERO_HEIGHT = 460

function useStretchyHero() {
  const heroRef = useRef<HTMLDivElement>(null)
  const imgWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hero = heroRef.current
    const imgWrap = imgWrapRef.current
    if (!hero || !imgWrap) return
    if (window.matchMedia('(min-width: 1024px)').matches) return

    let touchStartY: number | null = null
    let stretching = false

    const settleHero = () => {
      hero.style.transition = 'height 0.5s cubic-bezier(0.32, 0.72, 0, 1)'
      hero.style.height = `${MOBILE_HERO_HEIGHT}px`
    }

    const onScroll = () => {
      if (stretching) return
      const y = Math.max(0, window.scrollY)
      const scale = Math.min(1.18, 1 + y / 2400)
      imgWrap.style.transform = `scale(${scale})`
    }

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return
      touchStartY = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY === null) return
      if (window.scrollY > 0) { touchStartY = null; return }

      const delta = e.touches[0].clientY - touchStartY
      if (delta <= 0) {
        if (stretching) { stretching = false; settleHero() }
        return
      }

      e.preventDefault()
      stretching = true
      // Logarithmic damping — feels like iOS rubber band
      const damped = Math.min(MOBILE_HERO_HEIGHT, Math.log(1 + delta / 8) * 60)
      hero.style.transition = ''
      hero.style.height = `${MOBILE_HERO_HEIGHT + damped}px`
      imgWrap.style.transition = ''
      imgWrap.style.transform = 'scale(1)'
    }

    const onTouchEnd = () => {
      touchStartY = null
      if (stretching) { stretching = false; settleHero() }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  return { heroRef, imgWrapRef }
}

interface Props {
  recipe: Recipe
  categoryName: string
}

// ─── Desktop detail ──────────────────────────────────────

function DesktopDetail({ recipe, categoryName }: Props) {
  const router = useRouter()
  const baseServings = parseServings(recipe.servings)
  const [scale, setScale] = useState(1)
  const [unitMode, setUnitMode] = useState<'metric' | 'imperial' | 'cups'>('metric')
  const [checkedIngs, setCheckedIngs] = useState<Set<number>>(new Set())
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set())

  const toggleIng = (i: number) => {
    const next = new Set(checkedIngs)
    next.has(i) ? next.delete(i) : next.add(i)
    setCheckedIngs(next)
  }

  const toggleStep = (i: number) => {
    const next = new Set(checkedSteps)
    next.has(i) ? next.delete(i) : next.add(i)
    setCheckedSteps(next)
  }

  return (
    <div>
      {/* Hero: back + 2-col title/image */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '32px 40px 0' }}>
        <button
          type="button"
          onClick={() => window.history.length > 1 ? router.back() : router.push('/rezepte')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13.5, fontFamily: 'inherit', padding: 0, marginBottom: 28 }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Zurück
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 56, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 18 }}>
              {categoryName}
            </div>
            <h1 style={{ fontSize: 64, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -1.5, color: 'var(--text)', margin: '0 0 22px', lineHeight: 1 }}>
              {recipe.title}
            </h1>

            <div style={{ display: 'flex', gap: 36, paddingTop: 28, borderTop: '1px solid var(--border)' }}>
              {recipe.time_minutes > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Zeit</div>
                  <div style={{ fontSize: 22, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>{recipe.time_minutes} min</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Personen</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" onClick={() => setScale(s => Math.max(0.25, s - 0.25))}
                    style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border)', background: 'white', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
                  </button>
                  <div style={{ fontSize: 22, fontFamily: 'var(--font-serif)', color: 'var(--text)', minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(baseServings * scale)}
                  </div>
                  <button type="button" onClick={() => setScale(s => s + 0.25)}
                    style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border)', background: 'white', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Einheiten</div>
                <select value={unitMode} onChange={e => setUnitMode(e.target.value as typeof unitMode)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="metric">g · ml</option>
                  <option value="imperial">oz · fl oz</option>
                  <option value="cups">cups</option>
                </select>
              </div>
            </div>
          </div>

          {/* Recipe image */}
          <div style={{ aspectRatio: '4/5', borderRadius: 4, overflow: 'hidden', position: 'relative', background: 'var(--border)', boxShadow: '0 30px 80px rgba(80,50,20,0.18)' }}>
            {recipe.image_url && (
              <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="(min-width:1024px) 50vw, 100vw" priority blurhash={recipe.image_blurhash} />
            )}
          </div>
        </div>
      </section>

      {/* 2-col body: sticky ingredients + steps */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '80px 40px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 80, alignItems: 'start' }}>

          {/* Ingredients sidebar (sticky) */}
          <aside style={{ position: 'sticky', top: 96 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 }}>
              Zutaten
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
              für {Math.round(baseServings * scale)} {Math.round(baseServings * scale) === 1 ? 'Person' : 'Personen'}
            </div>
            <div>
              {recipe.ingredients.map((ing, i) => {
                const amountStr = formatIngredientAmount(ing.amount, ing.unit, ing.display, scale, unitMode)
                const isChecked = checkedIngs.has(i)
                return (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleIng(i)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleIng(i) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 0', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      opacity: isChecked ? 0.42 : 1, transition: 'opacity 0.15s',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                      border: `1.5px solid ${isChecked ? 'var(--accent)' : 'var(--border)'}`,
                      background: isChecked ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                    }}>
                      {isChecked && (
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, fontSize: 14.5, color: 'var(--text)', textDecoration: isChecked ? 'line-through' : 'none' }}>{ing.name}</div>
                    <div style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{amountStr}</div>
                  </div>
                )
              })}
            </div>
          </aside>

          {/* Steps */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 }}>
              Zubereitung
            </div>
            <h2 style={{ fontSize: 32, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.5, color: 'var(--text)', margin: '0 0 32px', lineHeight: 1.1 }}>
              In {recipe.steps.length} Schritten
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {recipe.steps.map((step, i) => {
                const isChecked = checkedSteps.has(i)
                return (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleStep(i)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleStep(i) }}
                    style={{ display: 'flex', gap: 24, cursor: 'pointer', opacity: isChecked ? 0.5 : 1 }}
                  >
                    <div style={{ width: 56, flexShrink: 0, fontSize: 44, fontFamily: 'var(--font-serif)', color: 'var(--accent)', lineHeight: 1, fontStyle: 'italic' }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div style={{ flex: 1, paddingTop: 4 }}>
                      <div style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text)', fontFamily: 'var(--font-serif)', textDecoration: isChecked ? 'line-through' : 'none' }}>
                        {step}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {recipe.notes && (
              <div style={{ marginTop: 56, padding: '32px 36px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 2.5 }}>
                  ✦ Tipp ✦
                </div>
                <div style={{ fontSize: 18, color: 'var(--text)', lineHeight: 1.55, fontFamily: 'var(--font-serif)', fontStyle: 'italic', maxWidth: 560, margin: '0 auto' }}>
                  „{recipe.notes}"
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────

export function DetailClient({ recipe, categoryName }: Props) {
  const router = useRouter()
  const { heroRef, imgWrapRef } = useStretchyHero()

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
    <>
      <PersistLastRecipe slug={recipe.slug} />

      {/* Desktop */}
      <div className="hidden lg:block">
        <DesktopDetail recipe={recipe} categoryName={categoryName} />
      </div>

      {/* Mobile */}
      <div className="lg:hidden pb-10">
        <div ref={heroRef} className="relative overflow-hidden" style={{ height: MOBILE_HERO_HEIGHT, background: 'var(--border)' }}>
          <div ref={imgWrapRef} className="absolute inset-0" style={{ transformOrigin: 'top center', willChange: 'transform' }}>
            {recipe.image_url && (
              <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="100vw" priority blurhash={recipe.image_blurhash} />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 35%, rgba(0,0,0,0.6) 100%)' }} />
          </div>
          <button
            type="button"
            onClick={() => window.history.length > 1 ? router.back() : router.push('/rezepte')}
            className="absolute top-14 left-4 w-10 h-10 rounded-full flex items-center justify-center border-none cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        </div>

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

        <div className="px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)' }}>Zutaten</p>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <IngredientList ingredients={recipe.ingredients} servingsRaw={recipe.servings} />
        </div>

        <div className="px-6 py-2">
          <div className="flex items-center gap-4 mb-5">
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)' }}>Zubereitung</p>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <StepList steps={recipe.steps} />
        </div>

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
    </>
  )
}
