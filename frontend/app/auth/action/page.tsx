'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  verifyPasswordResetCode, confirmPasswordReset,
  applyActionCode, checkActionCode,
  signInWithEmailLink,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { clientLogin } from '@/lib/api'

// Custom Firebase email-action handler. Set the action URL of every email
// template in the Firebase console to https://<frontend>/auth/action so that
// password reset / verification happens on OUR origin. This keeps the new
// password saved by the browser's password manager under the same domain as
// /login (so it autofills there), and lets us brand the page.
//
// Handles every mode Firebase can send: resetPassword, verifyEmail,
// verifyAndChangeEmail, recoverEmail, revertSecondFactorAddition, signIn.

type View = 'loading' | 'resetForm' | 'resetDone' | 'signInForm' | 'info' | 'error'

const T = {
  accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A',
  bg: '#FAF6EF', card: '#fff', field: '#FAF6EF',
  border: 'rgba(120,90,60,0.2)', danger: '#B91C1C',
  success: '#15803D', successBg: '#ECFDF3',
}

export default function AuthActionPage() {
  const router = useRouter()
  const [view, setView] = useState<View>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const codeRef = useRef('')

  const fail = (t: string, m: string) => { setTitle(t); setMessage(m); setView('error') }
  const done = (t: string, m: string) => { setTitle(t); setMessage(m); setView('info') }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('mode') ?? ''
    const code = params.get('oobCode') ?? ''
    codeRef.current = code

    const run = async () => {
      // signIn (email-link) carries no oobCode; every other mode requires one.
      if (mode !== 'signIn' && !code) {
        fail('Ungültiger Link', 'Diesem Link fehlt der Bestätigungscode. Bitte fordere einen neuen an.')
        return
      }
      try {
        switch (mode) {
          case 'resetPassword': {
            const mail = await verifyPasswordResetCode(auth, code)
            setEmail(mail)
            setView('resetForm')
            break
          }
          case 'verifyEmail':
          case 'verifyAndChangeEmail': {
            await applyActionCode(auth, code)
            done('E-Mail bestätigt', 'Deine E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.')
            break
          }
          case 'recoverEmail': {
            const info = await checkActionCode(auth, code)
            await applyActionCode(auth, code)
            const mail = info.data.email ?? ''
            done('E-Mail wiederhergestellt', `Deine frühere E-Mail-Adresse${mail ? ` (${mail})` : ''} wurde wiederhergestellt. Setze aus Sicherheitsgründen anschließend dein Passwort neu.`)
            break
          }
          case 'revertSecondFactorAddition': {
            await applyActionCode(auth, code)
            done('Änderung rückgängig gemacht', 'Die Zwei-Faktor-Einstellung wurde wieder entfernt.')
            break
          }
          case 'signIn': {
            // Passwordless email-link sign-in needs the email; ask for it.
            setView('signInForm')
            break
          }
          default:
            fail('Aktion nicht unterstützt', 'Dieser Link kann hier nicht verarbeitet werden.')
        }
      } catch {
        fail('Link ungültig oder abgelaufen', 'Bitte fordere über die Anmeldeseite einen neuen Link an.')
      }
    }
    run()
  }, [])

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Das Passwort muss mindestens 8 Zeichen lang sein.'); return }
    if (password !== confirm) { setError('Die Passwörter stimmen nicht überein.'); return }
    setBusy(true); setError('')
    try {
      await confirmPasswordReset(auth, codeRef.current, password)
      setView('resetDone')
    } catch {
      setError('Das hat nicht geklappt — der Link ist vermutlich abgelaufen. Bitte fordere einen neuen an.')
      setBusy(false)
    }
  }

  const submitSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const cred = await signInWithEmailLink(auth, email.trim(), window.location.href)
      await clientLogin(await cred.user.getIdToken())
      router.push('/'); router.refresh()
    } catch {
      setError('Anmeldung fehlgeschlagen. Prüfe die E-Mail-Adresse oder fordere einen neuen Link an.')
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: T.muted, marginBottom: 6 }}>Mein</p>
          <h1 style={{ fontSize: 40, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, letterSpacing: -1, lineHeight: 1, margin: 0 }}>Kochbuch</h1>
        </div>

        <div style={{ background: T.card, borderRadius: 20, padding: 28, boxShadow: '0 4px 24px rgba(80,50,20,0.10)' }}>
          {view === 'loading' && (
            <p style={{ textAlign: 'center', color: T.muted, fontSize: 14, margin: '12px 0' }}>Einen Moment…</p>
          )}

          {view === 'resetForm' && (
            <>
              <h2 style={headingStyle}>Passwort festlegen</h2>
              <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55, margin: '0 0 18px' }}>
                Wähle ein Passwort für <strong style={{ color: T.text }}>{email}</strong>. Tipp: speichere es
                direkt im Passwort-Manager — beim nächsten Login wird es dann automatisch ausgefüllt.
              </p>
              <form onSubmit={submitReset}>
                {/* Hidden username so the password manager stores email + password together, under this origin. */}
                <input type="email" value={email} readOnly autoComplete="username" name="email"
                  style={{ ...fieldStyle, marginBottom: 10 }} />
                <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError('') }}
                  autoComplete="new-password" name="new-password" placeholder="Neues Passwort (min. 8 Zeichen)" required style={fieldStyle} />
                <input type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError('') }}
                  autoComplete="new-password" placeholder="Passwort wiederholen" required style={{ ...fieldStyle, marginTop: 10 }} />
                {error && <p style={{ fontSize: 13, color: T.danger, margin: '10px 0 0', lineHeight: 1.4 }}>{error}</p>}
                <button type="submit" disabled={busy} style={primaryBtn(busy)}>
                  {busy ? 'Wird gespeichert…' : 'Passwort speichern'}
                </button>
              </form>
            </>
          )}

          {view === 'resetDone' && (
            <div style={{ textAlign: 'center' }}>
              <SuccessMark />
              <h2 style={{ ...headingStyle, marginBottom: 6 }}>Passwort gesetzt</h2>
              <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5, margin: '0 0 4px' }}>
                Du kannst dich jetzt mit <strong style={{ color: T.text }}>{email}</strong> und deinem neuen Passwort anmelden.
              </p>
              <button onClick={() => router.push('/login')} style={primaryBtn(false)}>Zur Anmeldung</button>
            </div>
          )}

          {view === 'signInForm' && (
            <>
              <h2 style={headingStyle}>Anmelden</h2>
              <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55, margin: '0 0 18px' }}>
                Bestätige deine E-Mail-Adresse, um die Anmeldung über den Link abzuschließen.
              </p>
              <form onSubmit={submitSignIn}>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }}
                  autoComplete="email" placeholder="E-Mail" required style={fieldStyle} />
                {error && <p style={{ fontSize: 13, color: T.danger, margin: '10px 0 0', lineHeight: 1.4 }}>{error}</p>}
                <button type="submit" disabled={busy} style={primaryBtn(busy)}>
                  {busy ? 'Bitte warten…' : 'Anmelden'}
                </button>
              </form>
            </>
          )}

          {view === 'info' && (
            <div style={{ textAlign: 'center' }}>
              <SuccessMark />
              <h2 style={{ ...headingStyle, marginBottom: 6 }}>{title}</h2>
              <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5, margin: 0 }}>{message}</p>
              <button onClick={() => router.push('/login')} style={primaryBtn(false)}>Zur Anmeldung</button>
            </div>
          )}

          {view === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FEE2E2', color: T.danger, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 10 }}>!</div>
              <h2 style={{ ...headingStyle, marginBottom: 6 }}>{title}</h2>
              <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5, margin: 0 }}>{message}</p>
              <button onClick={() => router.push('/login')} style={primaryBtn(false)}>Zur Anmeldung</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SuccessMark() {
  return (
    <div style={{ width: 52, height: 52, borderRadius: '50%', background: T.successBg, color: T.success, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 10 }}>✓</div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: `1px solid ${T.border}`, background: T.field,
  fontSize: 15, color: T.text, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
}

const headingStyle: React.CSSProperties = {
  fontSize: 22, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, margin: '0 0 8px',
}

function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
    background: busy ? '#e0d8cf' : T.accent, color: '#fff',
    fontSize: 15, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', marginTop: 16,
  }
}
