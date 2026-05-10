import Link from 'next/link'
import { PendingJobs } from './pending-jobs'

export const unstable_instant = false

export default function NeuPage() {
  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px 96px' }}>
      <h1 style={{ fontSize: 32, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.5, color: 'var(--text)', margin: '0 0 8px' }}>
        Neues Rezept
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 24px' }}>Wie möchtest du dein Rezept anlegen?</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href="/neu/aus-bild" style={cardStyle}>
          <span style={iconStyle}>📷</span>
          <div>
            <div style={titleStyle}>Aus Bildern</div>
            <div style={subStyle}>Foto hochladen, KI füllt das Rezept aus</div>
          </div>
          <span style={chevStyle}>→</span>
        </Link>
        <Link href="/neu/manuell" style={cardStyle}>
          <span style={iconStyle}>✎</span>
          <div>
            <div style={titleStyle}>Manuell</div>
            <div style={subStyle}>Selbst Schritt für Schritt eingeben</div>
          </div>
          <span style={chevStyle}>→</span>
        </Link>
      </div>

      <PendingJobs dailyLimit={20} />
    </main>
  )
}

const cardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: 18,
  borderRadius: 14, border: '1px solid var(--border)', background: 'white',
  textDecoration: 'none', color: 'var(--text)',
}
const iconStyle: React.CSSProperties = { fontSize: 28, lineHeight: 1 }
const titleStyle: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text)' }
const subStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', marginTop: 2 }
const chevStyle: React.CSSProperties = { marginLeft: 'auto', color: 'var(--muted)', fontSize: 18 }
