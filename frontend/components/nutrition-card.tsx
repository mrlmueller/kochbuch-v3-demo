import type { Macros } from '@/lib/api'

// Nutrition donut — the compact "Donut" design the user chose: a small ring
// (kcal in the centre) sitting BESIDE a simple legend (colour dot · label ·
// value, no bars), with a tight inline sugar/fibre footer. Donut + legend stay
// side-by-side; they only wrap on very narrow viewports. Theme-aware via the
// page's CSS vars.

const SERIF = 'var(--font-serif)'
const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const round = (v: number) => Math.round(v)

// Three accent shades for the macros (theme-aware via color-mix).
const MACRO_COLORS = [
  'var(--accent)',
  'color-mix(in srgb, var(--accent) 60%, transparent)',
  'color-mix(in srgb, var(--accent) 33%, transparent)',
]
const RING_BG = 'color-mix(in srgb, var(--accent) 12%, transparent)'

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

  // Donut geometry.
  const R = 52, SW = 14, C = 2 * Math.PI * R
  let offset = 0
  const segs = macros.map((m, i) => {
    const frac = m.value / total
    const s = { dash: frac * C, off: offset, color: MACRO_COLORS[i] }
    offset += frac * C
    return s
  })

  return (
    <section aria-label="Nährwerte pro Portion">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 21, fontWeight: 700, color: 'var(--text)', fontFamily: SERIF, letterSpacing: -0.3, margin: 0, lineHeight: 1 }}>Nährwerte</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', fontFamily: SERIF }}>pro Person · geschätzt</span>
      </div>

      <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 18, padding: 20, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        {/* Ring with kcal in the centre */}
        <div style={{ position: 'relative', width: 132, height: 132, flexShrink: 0, margin: '0 auto' }}>
          <svg width="132" height="132" viewBox="0 0 132 132">
            <circle cx="66" cy="66" r={R} fill="none" strokeWidth={SW} style={{ stroke: RING_BG }} />
            {segs.map((s, i) => (
              <circle key={i} cx="66" cy="66" r={R} fill="none" strokeWidth={SW}
                strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={-s.off}
                transform="rotate(-90 66 66)" strokeLinecap="butt" style={{ stroke: s.color }} />
            ))}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 30, fontFamily: SERIF, color: 'var(--text)', lineHeight: 1, ...NUM }}>{round(n.kcal)}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>kcal</span>
          </div>
        </div>

        {/* Legend (dot · label · value) + inline footer */}
        <div style={{ flex: 1, minWidth: 158, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {macros.map((m, i) => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: MACRO_COLORS[i], flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text)' }}>{m.label}</span>
              <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700, ...NUM }}>{m.value} g</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4, paddingTop: 11, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {minor.map((m) => (
              <span key={m.label} style={{ fontSize: 12, color: 'var(--muted)' }}>
                {m.label} <b style={{ color: 'var(--text)', fontWeight: 700, ...NUM }}>{m.value} g</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
