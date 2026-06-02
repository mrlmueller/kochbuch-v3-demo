'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Recipe } from '@/lib/api'
import { clientDeleteRecipe } from '@/lib/api'
import { useMe } from '@/lib/use-me'
import { useAdminConfirmations } from '@/lib/use-admin-confirmations'
import { BlurImage } from '@/components/blur-image'
import { IngredientList } from '@/components/ingredient-list'
import { StepList } from '@/components/step-list'
import { formatIngredientAmount, parseServings } from '@/lib/utils'
import { PersistLastRecipe } from '@/components/persist-last-recipe'

// Renders the Bearbeiten/Löschen buttons when the current user created
// this recipe. Looks up the user via the cached useMe() hook so the
// recipe page itself stays statically prerendered — the auth round-trip
// happens client-side, in the background, behind a sessionStorage cache.
function OwnerControls({ recipe }: { recipe: Recipe }) {
  const { me } = useMe()
  if (!me) return null
  const isOwner = !!recipe.created_by && me.id === recipe.created_by
  const isAdmin = me.role === 'admin'
  // Admins can edit any recipe; deletion stays owner-only so the global
  // catalogue can't be removed by accident while calibrating.
  if (!isOwner && !isAdmin) return null
  return <OwnerActions recipe={recipe} canDelete={isOwner} />
}

function OwnerActions({ recipe, canDelete }: { recipe: Recipe; canDelete: boolean }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  // Close on Escape, lock background scroll while open.
  useEffect(() => {
    if (!confirmOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmOpen(false) }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [confirmOpen])

  async function confirmDelete() {
    setDeleting(true)
    setError('')
    try {
      await clientDeleteRecipe(recipe.slug)
      router.push('/rezepte')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen')
      setDeleting(false)
    }
  }

  return (
    <>
      <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <Link href={`/rezept/${recipe.slug}/bearbeiten`} style={ownerBtn}>Bearbeiten</Link>
        {canDelete && (
          <button type="button" onClick={() => setConfirmOpen(true)} style={{ ...ownerBtn, color: '#B91C1C' }}>
            Löschen
          </button>
        )}
      </div>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-recipe-title"
          onClick={() => !deleting && setConfirmOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(40,25,10,0.45)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg, #fff)', borderRadius: 18, padding: 24,
              maxWidth: 400, width: '100%',
              boxShadow: '0 30px 80px rgba(40,25,10,0.25), 0 8px 24px rgba(40,25,10,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#FEE2E2', color: '#B91C1C',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                </svg>
              </div>
              <h2 id="delete-recipe-title" style={{ fontSize: 20, fontFamily: "'DM Serif Display', Georgia, serif", color: 'var(--text)', margin: 0, lineHeight: 1.15 }}>
                Rezept löschen?
              </h2>
            </div>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
              „{recipe.title}" wird unwiderruflich entfernt. Das lässt sich nicht rückgängig machen.
            </p>
            {error && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FEE2E2', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                style={{ ...ownerBtn, padding: '10px 16px', fontSize: 14, opacity: deleting ? 0.5 : 1 }}>
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                autoFocus
                style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: '#B91C1C', color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: deleting ? 'wait' : 'pointer', fontFamily: 'inherit',
                  opacity: deleting ? 0.7 : 1,
                }}>
                {deleting ? 'Löscht…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const ownerBtn: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  textDecoration: 'none', color: 'var(--text)', fontFamily: 'inherit',
}

// Admin-only calibration badge + one-click confirm toggle. Renders nothing
// for normal users, so the public recipe page stays byte-identical.
function CalibrationControl({ slug }: { slug: string }) {
  const { isAdmin, ready, isConfirmed, setConfirmed } = useAdminConfirmations()
  const [busy, setBusy] = useState(false)
  if (!isAdmin) return null
  const confirmed = isConfirmed(slug)
  const toggle = async () => {
    setBusy(true)
    try { await setConfirmed(slug, !confirmed) } catch { /* hook reverts */ } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3,
        background: confirmed ? '#DCFCE7' : '#FEF3C7',
        color: confirmed ? '#15803D' : '#B45309',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: confirmed ? '#16A34A' : '#D97706' }} />
        {confirmed ? 'Kalibriert' : 'Nicht kalibriert'}
      </span>
      <button type="button" onClick={toggle} disabled={busy || !ready}
        style={{ ...ownerBtn, opacity: busy || !ready ? 0.6 : 1, cursor: busy || !ready ? 'wait' : 'pointer' }}>
        {confirmed ? 'Markierung entfernen' : 'Als kalibriert markieren'}
      </button>
    </div>
  )
}

const MOBILE_HERO_HEIGHT = 460

function useStretchyHero() {
  const heroRef = useRef<HTMLDivElement>(null)
  const imgWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hero = heroRef.current
    const imgWrap = imgWrapRef.current
    if (!hero || !imgWrap) return
    if (window.matchMedia('(min-width: 1024px)').matches) return

    // Stretch state machine. A finger-down begins in `pending`. Once the
    // gesture has moved more than DECIDE_PX, we classify it once into
    // `stretch` (downward, vertical-dominant) or `dismiss` (everything
    // else — horizontal swipe-back, upward, or ambiguous). Once classified
    // we never re-evaluate, so wiggling sideways during a swipe-back
    // can't accidentally drag the hero down.
    type Mode = 'idle' | 'pending' | 'stretch' | 'dismiss'
    const EDGE_GUTTER_PX = 28        // ignore Safari swipe-back zone
    const DECIDE_PX = 10             // commit threshold
    const VERT_DOMINANCE = 1.4       // |dy| must be 1.4× |dx| to stretch

    let mode: Mode = 'idle'
    let startX = 0
    let startY = 0

    const settleHero = () => {
      hero.style.transition = 'height 0.5s cubic-bezier(0.32, 0.72, 0, 1)'
      hero.style.height = `${MOBILE_HERO_HEIGHT}px`
    }

    const onScroll = () => {
      if (mode === 'stretch') return
      const y = Math.max(0, window.scrollY)
      const scale = Math.min(1.18, 1 + y / 2400)
      imgWrap.style.transform = `scale(${scale})`
    }

    const onTouchStart = (e: TouchEvent) => {
      // Only consider gestures that start at the top of the page.
      if (window.scrollY > 0) return
      // Multi-touch (pinch etc.) — don't try to interpret.
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      // Leave Safari's edge swipe-back gesture alone.
      if (t.clientX <= EDGE_GUTTER_PX) return
      startX = t.clientX
      startY = t.clientY
      mode = 'pending'
    }

    const onTouchMove = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'dismiss') return
      if (window.scrollY > 0) { mode = 'dismiss'; return }
      if (e.touches.length !== 1) { mode = 'dismiss'; return }

      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY

      if (mode === 'pending') {
        // Wait for the gesture to commit to a direction.
        if (Math.hypot(dx, dy) < DECIDE_PX) return
        // Horizontal-dominant or upward → not a stretch.
        if (Math.abs(dx) * VERT_DOMINANCE >= Math.abs(dy) || dy <= 0) {
          mode = 'dismiss'
          return
        }
        mode = 'stretch'
      }

      // mode === 'stretch' — apply rubber-band damping.
      const dyForStretch = Math.max(0, dy)
      e.preventDefault()
      const damped = Math.min(MOBILE_HERO_HEIGHT, Math.log(1 + dyForStretch / 8) * 60)
      hero.style.transition = ''
      hero.style.height = `${MOBILE_HERO_HEIGHT + damped}px`
      imgWrap.style.transition = ''
      imgWrap.style.transform = 'scale(1)'
    }

    const onTouchEnd = () => {
      if (mode === 'stretch') settleHero()
      mode = 'idle'
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
            <h1 style={{ fontSize: 64, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -1.5, color: 'var(--text)', margin: '0 0 14px', lineHeight: 1 }}>
              {recipe.title}
            </h1>
            <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <OwnerControls recipe={recipe} />
              <CalibrationControl slug={recipe.slug} />
            </div>

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
                const amountStr = formatIngredientAmount(ing.amount, ing.unit, ing.display, scale, 'metric')
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
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
            <OwnerControls recipe={recipe} />
            <CalibrationControl slug={recipe.slug} />
          </div>
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
