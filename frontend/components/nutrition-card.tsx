import type { Macros } from '@/lib/api'

const T = { text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', accent: '#C2410C' }
const g = (n: number) => `${Math.round(n)} g`

export function NutritionCard({ perServing }: { perServing: Macros }) {
  const m = perServing
  return (
    <section aria-label="Nährwerte pro Portion" style={{ border: `1px solid ${T.border}`, borderRadius: 16, padding: 18, background: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 34, fontWeight: 700, color: T.text, lineHeight: 1, fontFamily: "'DM Serif Display', Georgia, serif" }}>
          {Math.round(m.kcal)} <span style={{ fontSize: 16, fontWeight: 600 }}>kcal</span>
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>pro Portion</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, textAlign: 'center' }}>
        {[['Eiweiß', m.protein_g], ['Fett', m.fat_g], ['KH', m.carbs_g]].map(([label, v]) => (
          <div key={label as string} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 4px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{g(v as number)}</div>
            <div style={{ fontSize: 11, color: T.muted }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 10 }}>
        Zucker {g(m.sugar_g)} · Ballaststoffe {g(m.fibre_g)}
      </div>
      <div style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 4, fontStyle: 'italic' }}>
        ≈ geschätzte Werte
      </div>
    </section>
  )
}
