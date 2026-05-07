'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { clientLogin } from '@/lib/api'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const afterFirebase = async (idToken: string) => {
    const user = await clientLogin(idToken)
    router.push(user.role === 'admin' ? '/admin' : '/')
  }

  const handleGoogle = async () => {
    setLoading(true); setError('')
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      await afterFirebase(await result.user.getIdToken())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      setError(msg.includes('not authorized') ? 'Kein Zugang — wende dich an den Admin.' : 'Google-Login fehlgeschlagen.')
      setLoading(false)
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      let result
      if (mode === 'register') {
        result = await createUserWithEmailAndPassword(auth, email, password)
      } else {
        result = await signInWithEmailAndPassword(auth, email, password)
      }
      await afterFirebase(await result.user.getIdToken())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      const code = (e as { code?: string }).code
      if (msg.includes('not authorized') || msg.includes('403')) {
        setError('Kein Zugang — wende dich an den Admin.')
      } else if (code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        setError('E-Mail oder Passwort falsch.')
      } else if (code === 'auth/email-already-in-use') {
        setError('E-Mail bereits registriert — bitte einloggen.')
      } else {
        setError('Fehler: ' + (msg || 'Unbekannter Fehler'))
      }
      setLoading(false)
    }
  }

  const accent = '#C2410C'

  return (
    <div style={{ minHeight: '100vh', background: '#FAF6EF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#7A6B5A', marginBottom: 6 }}>Mein</p>
          <h1 style={{ fontSize: 40, fontFamily: "'DM Serif Display', Georgia, serif", color: '#2A1F14', letterSpacing: -1, lineHeight: 1, margin: 0 }}>Kochbuch</h1>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 4px 24px rgba(80,50,20,0.10)' }}>
          {/* Google */}
          <button onClick={handleGoogle} disabled={loading} style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            border: '1px solid rgba(120,90,60,0.2)', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 15, fontWeight: 600, color: '#2A1F14', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', marginBottom: 18,
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Mit Google anmelden
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(120,90,60,0.15)' }} />
            <span style={{ fontSize: 12, color: '#7A6B5A' }}>oder</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(120,90,60,0.15)' }} />
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: '#FAF6EF', borderRadius: 10, padding: 3, marginBottom: 18 }}>
            {(['login', 'register'] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#2A1F14' : '#7A6B5A',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: mode === m ? '0 1px 4px rgba(80,50,20,0.1)' : 'none',
              }}>{m === 'login' ? 'Einloggen' : 'Registrieren'}</button>
            ))}
          </div>

          <form onSubmit={handleEmail}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="E-Mail" required style={fieldStyle} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Passwort" required style={{ ...fieldStyle, marginTop: 10 }} />
            {error && (
              <p style={{ fontSize: 13, color: '#B91C1C', margin: '10px 0 0', lineHeight: 1.4 }}>{error}</p>
            )}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
              background: loading ? '#e0d8cf' : accent, color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', marginTop: 16,
            }}>
              {loading ? 'Bitte warten…' : mode === 'login' ? 'Einloggen' : 'Konto erstellen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid rgba(120,90,60,0.2)', background: '#FAF6EF',
  fontSize: 15, color: '#2A1F14', fontFamily: 'inherit', boxSizing: 'border-box',
  outline: 'none',
}
