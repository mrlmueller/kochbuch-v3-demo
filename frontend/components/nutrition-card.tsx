import type { Macros } from '@/lib/api'

// Nutrition donut — the compact "Donut" design the user chose: a small ring
// (kcal in the centre) sitting BESIDE a simple legend (colour dot · label ·
// value, no bars), with a tight inline sugar/fibre footer. The ring + legend
// are forced side-by-side (nowrap); the legend flexes down rather than
// wrapping below. Theme-aware via the page's CSS vars.

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
  const R = 46, SW = 13, C = 2 * Math.PI * R
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

      <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 18, padding: 18, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'nowrap' }}>
        {/* Ring with kcal in the centre */}
        <div style={{ position: 'relative', width: 112, height: 112, flexShrink: 0 }}>
          <svg width="112" height="112" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r={R} fill="none" strokeWidth={SW} style={{ stroke: RING_BG }} />
            {segs.map((s, i) => (
              <circle key={i} cx="56" cy="56" r={R} fill="none" strokeWidth={SW}
                strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={-s.off}
                transform="rotate(-90 56 56)" strokeLinecap="butt" style={{ stroke: s.color }} />
            ))}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 27, fontFamily: SERIF, color: 'var(--text)', lineHeight: 1, ...NUM }}>{round(n.kcal)}</span>
            <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>kcal</span>
          </div>
        </div>

        {/* Legend (dot · label · value) + inline footer */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {macros.map((m, i) => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: MACRO_COLORS[i], flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text)', minWidth: 0 }}>{m.label}</span>
              <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap', ...NUM }}>{m.value} g</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginTop: 3, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            {minor.map((m) => (
              <span key={m.label} style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {m.label} <b style={{ color: 'var(--text)', fontWeight: 700, ...NUM }}>{m.value} g</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
