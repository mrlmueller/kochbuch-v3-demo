import type { Macros } from '@/lib/api'

// Nutrition donut — adapted from the Claude "Donut" design (the variant the
// user chose). kcal is the hero (centre of the ring); protein/fat/carbs are
// the three ring segments + a legend with proportion bars; sugar/fibre sit
// quietly as two footer tiles. Theme-aware via the page's CSS vars, and the
// row layout stacks vertically on narrow screens.

const SERIF = 'var(--font-serif)'
const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const round = (v: number) => Math.round(v)

// Three accent shades for the macros (theme-aware via color-mix).
const MACRO_COLORS = [
  'var(--accent)',
  'color-mix(in srgb, var(--accent) 66%, transparent)',
  'color-mix(in srgb, var(--accent) 33%, transparent)',
]
const RING_BG = 'color-mix(in srgb, var(--accent) 9%, transparent)'
const BAR_BG = 'color-mix(in srgb, var(--accent) 9%, transparent)'
const TILE_BG = 'color-mix(in srgb, var(--accent) 7%, transparent)'

export function NutritionCard({ perServing }: { perServing: Macros }) {
  const n = perServing
  const macros = [
    { label: 'Eiweiß', value: round(n.protein_g) },
    { label: 'Fett', value: round(n.fat_g) },
    { label: 'Kohlenhydrate', value: round(n.carbs_g) },
  ]
  const minor = [
    { label: 'davon Zucker', value: round(n.sugar_g) },
    { label: 'Ballaststoffe', value: round(n.fibre_g) },
  ]
  const total = macros.reduce((s, m) => s + m.value, 0) || 1
  const max = Math.max(...macros.map((m) => m.value), 1)

  // Donut geometry.
  const R = 80, SW = 24, C = 2 * Math.PI * R
  let offset = 0
  const segs = macros.map((m, i) => {
    const frac = m.value / total
    const s = { dash: frac * C, off: offset, color: MACRO_COLORS[i] }
    offset += frac * C
    return s
  })

  return (
    <section aria-label="Nährwerte pro Portion">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h2 style={{ fontSize: 28, fontFamily: SERIF, fontWeight: 400, letterSpacing: -0.5, color: 'var(--text)', margin: 0, lineHeight: 1 }}>Nährwerte</h2>
        <span style={{ fontSize: 13.5, color: 'var(--muted)', fontStyle: 'italic', fontFamily: SERIF }}>pro Portion · geschätzte Werte</span>
      </div>

      <div className="nutri-donut" style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 20, padding: '30px 32px', display: 'flex', alignItems: 'center', gap: 44, flexWrap: 'wrap' }}>
        {/* Ring with kcal in the centre */}
        <div style={{ position: 'relative', width: 196, height: 196, flexShrink: 0, margin: '0 auto' }}>
          <svg width="196" height="196" viewBox="0 0 196 196">
            <circle cx="98" cy="98" r={R} fill="none" strokeWidth={SW} style={{ stroke: RING_BG }} />
            {segs.map((s, i) => (
              <circle key={i} cx="98" cy="98" r={R} fill="none" strokeWidth={SW}
                strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={-s.off}
                transform="rotate(-90 98 98)" strokeLinecap="butt" style={{ stroke: s.color }} />
            ))}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 48, fontFamily: SERIF, color: 'var(--text)', lineHeight: 0.9, letterSpacing: -1.5, ...NUM }}>{round(n.kcal)}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, marginTop: 5 }}>kcal</span>
          </div>
        </div>

        {/* Macro legend + proportion bars */}
        <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {macros.map((m, i) => (
              <div key={m.label}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, marginBottom: 7 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 4, background: MACRO_COLORS[i], flexShrink: 0, transform: 'translateY(1px)' }} />
                  <span style={{ flex: 1, fontSize: 15.5, color: 'var(--text)' }}>{m.label}</span>
                  <span style={{ fontSize: 21, fontFamily: SERIF, color: 'var(--text)', lineHeight: 1, ...NUM }}>
                    {m.value}<span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 3, fontFamily: 'system-ui, sans-serif' }}>g</span>
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: BAR_BG, marginLeft: 22 }}>
                  <div style={{ height: '100%', width: `${(m.value / max) * 100}%`, background: MACRO_COLORS[i], borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
            {minor.map((m) => (
              <div key={m.label} style={{ flex: 1, background: TILE_BG, borderRadius: 14, padding: '13px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{m.label}</span>
                <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', fontFamily: SERIF, whiteSpace: 'nowrap', ...NUM }}>{m.value} g</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .nutri-donut { flex-direction: column !important; gap: 26px !important; padding: 26px 22px !important; align-items: stretch !important; }
        }
      `}</style>
    </section>
  )
}
