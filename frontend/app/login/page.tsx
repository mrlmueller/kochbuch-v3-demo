'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { clientLogin, clientSendPasswordSetup } from '@/lib/api'

type Mode = 'login' | 'setup'

// Warm editorial cookbook palette — shared with the rest of the app.
const T = {
  accent: '#C2410C', accentDark: '#9A340A',
  text: '#2A1F14', muted: '#7A6B5A',
  bg: '#FAF6EF', card: '#fff', field: '#FAF6EF',
  border: 'rgba(120,90,60,0.2)',
  danger: '#B91C1C',
  success: '#15803D', successBg: '#ECFDF3',
  warn: '#92400E', warnBg: '#FEF3C7', warnBorder: '#FDE68A',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Address the password emails come from; showing it helps users find the
// message (especially when it has been filed as spam). Defaults to Firebase's
// built-in sender, but set NEXT_PUBLIC_EMAIL_SENDER once a custom domain is
// configured in the Firebase console ("Domain anpassen"), e.g. noreply@kochbuch-v2.uk.
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ''
const senderHint =
  process.env.NEXT_PUBLIC_EMAIL_SENDER ||
  (projectId ? `noreply@${projectId}.firebaseapp.com` : 'noreply@…firebaseapp.com')

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')

  // Login state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Setup ("Erste Anmeldung") state
  const [setupEmail, setSetupEmail] = useState('')
  const [setupSent, setSetupSent] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState('')

  const switchMode = (m: Mode) => {
    setMode(m); setError(''); setSetupError('')
  }

  const afterFirebase = async (idToken: string) => {
    await clientLogin(idToken)
    router.push('/')
    router.refresh()
  }

  // Maps a thrown error to a German message. Returns true if it was a known
  // method-lock error (google XOR password, enforced by the backend).
  const showMethodLock = (msg: string): boolean => {
    if (msg.includes('use_google')) {
      setError('Dieses Konto ist mit Google verknüpft. Bitte oben auf „Mit Google anmelden" tippen.')
      return true
    }
    if (msg.includes('use_password')) {
      setError('Dieses Konto nutzt E-Mail + Passwort — bitte unten einloggen, nicht mit Google.')
      return true
    }
    return false
  }

  const handleGoogle = async () => {
    setLoading(true); setError('')
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      await afterFirebase(await result.user.getIdToken())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (!showMethodLock(msg)) {
        setError(msg.includes('not authorized') ? 'Kein Zugang — bitte wende dich an den Admin.' : 'Google-Login fehlgeschlagen.')
      }
      setLoading(false)
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      await afterFirebase(await result.user.getIdToken())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      const code = (e as { code?: string }).code
      if (showMethodLock(msg)) {
        // handled
      } else if (msg.includes('not authorized') || msg.includes('403')) {
        setError('Kein Zugang — bitte wende dich an den Admin.')
      } else if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('E-Mail oder Passwort falsch. Noch kein Passwort? Wechsle zu „Erste Anmeldung".')
      } else {
        setError('Fehler: ' + (msg || 'Unbekannter Fehler'))
      }
      setLoading(false)
    }
  }

  const handleSendSetup = async () => {
    if (!EMAIL_RE.test(setupEmail.trim())) {
      setSetupError('Bitte gib eine gültige E-Mail-Adresse ein.'); return
    }
    setSetupLoading(true); setSetupError('')
    // Routed through our backend, which sends our own branded mail (from our
    // domain, linking to /auth/action) only for allowlisted password accounts.
    // It always returns 200, so we never reveal whether an account exists.
    try { await clientSendPasswordSetup(setupEmail.trim()) } catch { /* ignore */ }
    setSetupLoading(false)
    setSetupSent(true)
  }

  const goToLoginPrefilled = () => {
    setEmail(setupEmail.trim())
    setPassword('')
    switchMode('login')
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: T.muted, marginBottom: 6 }}>Mein</p>
          <h1 style={{ fontSize: 40, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, letterSpacing: -1, lineHeight: 1, margin: 0 }}>Kochbuch</h1>
        </div>

        {/* Card */}
        <div style={{ background: T.card, borderRadius: 20, padding: 28, boxShadow: '0 4px 24px rgba(80,50,20,0.10)' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: T.field, borderRadius: 12, padding: 3, marginBottom: 22 }}>
            {([['login', 'Einloggen'], ['setup', 'Erste Anmeldung']] as [Mode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => switchMode(m)} style={{
                flex: 1, padding: '9px 0', borderRadius: 9, border: 'none',
                background: mode === m ? T.card : 'transparent',
                color: mode === m ? T.text : T.muted,
                fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: mode === m ? '0 1px 4px rgba(80,50,20,0.12)' : 'none',
                transition: 'background .15s, color .15s',
              }}>{label}</button>
            ))}
          </div>

          {mode === 'login' ? LoginView() : SetupView()}
        </div>

        {mode === 'login' && (
          <p style={{ textAlign: 'center', fontSize: 12.5, color: T.muted, marginTop: 18, lineHeight: 1.5 }}>
            Zum ersten Mal hier? Tippe oben auf <button onClick={() => switchMode('setup')} style={linkStyle}>„Erste Anmeldung"</button>.
          </p>
        )}
      </div>

      <style>{`
        @keyframes lf-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .lf-step { animation: lf-rise .35s ease both; }
      `}</style>
    </div>
  )

  // ─── Login ────────────────────────────────────────────────
  function LoginView() {
    return (
      <>
        <button onClick={handleGoogle} disabled={loading} style={{
          width: '100%', padding: '12px 16px', borderRadius: 12,
          border: `1px solid ${T.border}`, background: T.card,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontSize: 15, fontWeight: 600, color: T.text, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', marginBottom: 18,
        }}>
          <GoogleIcon />
          Mit Google anmelden
        </button>

        <Divider />

        <form onSubmit={handleEmail}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
            placeholder="E-Mail" required style={fieldStyle} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
            placeholder="Passwort" required style={{ ...fieldStyle, marginTop: 10 }} />
          {error && <p style={{ fontSize: 13, color: T.danger, margin: '10px 0 0', lineHeight: 1.4 }}>{error}</p>}
          <button type="submit" disabled={loading} style={primaryBtn(loading)}>
            {loading ? 'Bitte warten…' : 'Einloggen'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12.5, color: T.muted, margin: '14px 0 0' }}>
          Passwort vergessen oder noch keins?{' '}
          <button onClick={() => { setSetupEmail(email); switchMode('setup') }} style={linkStyle}>Passwort einrichten</button>
        </p>
      </>
    )
  }

  // ─── Setup / Erste Anmeldung ──────────────────────────────
  function SetupView() {
    if (!setupSent) {
      return (
        <>
          <h2 style={headingStyle}>Willkommen!</h2>
          <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55, margin: '0 0 18px' }}>
            Dein Konto wurde von einem Admin angelegt. In drei Schritten bist du startklar:
          </p>

          <ol style={stepListStyle}>
            <Step n={1} title="E-Mail eingeben">Gib unten die Adresse ein, mit der du eingeladen wurdest.</Step>
            <Step n={2} title="Link in der E-Mail öffnen">Wir senden dir eine E-Mail mit einem Link, um dein Passwort zu setzen.</Step>
            <Step n={3} title="Einloggen">Komm zurück und melde dich mit E-Mail + Passwort an.</Step>
          </ol>

          <input type="email" value={setupEmail} onChange={e => { setSetupEmail(e.target.value); setSetupError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSendSetup()} autoComplete="email"
            placeholder="deine@email.de" style={{ ...fieldStyle, marginTop: 4 }} />
          {setupError && <p style={{ fontSize: 13, color: T.danger, margin: '8px 0 0' }}>{setupError}</p>}
          <button onClick={handleSendSetup} disabled={setupLoading} style={primaryBtn(setupLoading)}>
            {setupLoading ? 'Wird gesendet…' : 'Link zum Passwort-Setzen senden'}
          </button>

          <div style={{ ...noteBox, marginTop: 16 }}>
            <strong style={{ color: T.text }}>Nutzt du Google?</strong> Dann brauchst du das hier nicht — geh zurück
            zu „Einloggen" und tippe auf „Mit Google anmelden".
          </div>
        </>
      )
    }

    return (
      <>
        <div className="lf-step" style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: T.successBg, color: T.success, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 10 }}>✓</div>
          <h2 style={{ ...headingStyle, marginBottom: 4 }}>E-Mail unterwegs</h2>
          <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5, margin: 0 }}>
            Falls die Adresse <strong style={{ color: T.text }}>{setupEmail.trim()}</strong> eingeladen wurde,
            ist jetzt eine E-Mail zum Setzen des Passworts unterwegs.
          </p>
        </div>

        {/* Spam warning — the single most important hint. */}
        <div className="lf-step" style={{ ...spamBox, marginTop: 18 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
          <div>
            <strong>Schau zuerst im Spam-/Junk-Ordner nach.</strong> Diese E-Mail landet dort sehr oft.
            Absender: <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{senderHint}</span>.
            Markiere sie als „Kein Spam", damit künftige E-Mails ankommen.
          </div>
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.muted, margin: '20px 0 10px' }}>
          So geht es weiter
        </p>
        <ol style={stepListStyle}>
          <Step n={1} title="Postfach öffnen">Öffne dein E-Mail-Programm — und denk an den Spam-Ordner.</Step>
          <Step n={2} title="Link anklicken">Öffne die E-Mail „Setze dein Passwort…" und tippe auf den Link darin.</Step>
          <Step n={3} title="Passwort wählen">Gib ein neues Passwort ein und bestätige es auf der Firebase-Seite.</Step>
          <Step n={4} title="Hierher zurück">Komm auf diese Seite zurück und logge dich ein.</Step>
        </ol>

        <button onClick={goToLoginPrefilled} style={primaryBtn(false)}>
          Passwort gesetzt → Jetzt einloggen
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14, fontSize: 12.5, color: T.muted, flexWrap: 'wrap' }}>
          <span>Keine E-Mail bekommen?</span>
          <button onClick={() => { setSetupSent(false) }} style={linkStyle}>Erneut senden</button>
          <span>· sonst Admin fragen.</span>
        </div>
      </>
    )
  }
}

// ─── Small presentational pieces ────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="lf-step" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', animationDelay: `${n * 60}ms` }}>
      <span style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
        background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700,
      }}>{n}</span>
      <div style={{ paddingTop: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0 }}>{title}</p>
        <p style={{ fontSize: 13, color: T.muted, margin: '2px 0 0', lineHeight: 1.45 }}>{children}</p>
      </div>
    </li>
  )
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(120,90,60,0.15)' }} />
      <span style={{ fontSize: 12, color: T.muted }}>oder</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(120,90,60,0.15)' }} />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
  )
}

// ─── Shared styles ──────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: `1px solid ${T.border}`, background: T.field,
  fontSize: 15, color: T.text, fontFamily: 'inherit', boxSizing: 'border-box',
  outline: 'none',
}

const headingStyle: React.CSSProperties = {
  fontSize: 22, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text,
  margin: '0 0 8px',
}

const stepListStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: '0 0 18px',
  display: 'flex', flexDirection: 'column', gap: 14,
}

const noteBox: React.CSSProperties = {
  fontSize: 12.5, color: T.muted, lineHeight: 1.5,
  background: T.field, borderRadius: 10, padding: '12px 14px',
}

const spamBox: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start',
  fontSize: 13, color: T.warn, lineHeight: 1.5,
  background: T.warnBg, border: `1px solid ${T.warnBorder}`,
  borderRadius: 12, padding: '12px 14px',
}

const linkStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0,
  color: T.accent, fontSize: 'inherit', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
}

function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
    background: busy ? '#e0d8cf' : T.accent, color: '#fff',
    fontSize: 15, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', marginTop: 16,
  }
}
