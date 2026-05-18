'use client'

import { useEffect, useState } from 'react'
import { clientTriggerBackup, type BackupResult } from '@/lib/api'

const T = {
  text: '#2A1F14',
  border: 'rgba(120,90,60,0.16)',
  surface: '#fff',
  danger: '#B91C1C',
  success: '#15803D',
  successBg: '#DCFCE7',
}

function DownloadIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// compact: icon-only button for the mobile admin top bar — the verbose
// result/error text shows as a fixed toast so it can't distort the header.
export function AdminBackupButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BackupResult | null>(null)
  const [error, setError] = useState('')

  // Auto-dismiss the success/error message after a few seconds.
  useEffect(() => {
    if (!result && !error) return
    const t = setTimeout(() => {
      setResult(null)
      setError('')
    }, 8000)
    return () => clearTimeout(t)
  }, [result, error])

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    setResult(null)
    setError('')
    try {
      const r = await clientTriggerBackup()
      setResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Backup fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          aria-label={busy ? 'Backup läuft' : 'Backup erstellen'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            border: `1px solid ${T.border}`, background: T.surface, color: T.text,
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.55 : 1,
          }}
        >
          <DownloadIcon size={16} />
        </button>
        {(result || error) && (
          <div style={{ position: 'fixed', left: 12, right: 12, bottom: 84, zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div
              style={{
                maxWidth: 420, padding: '9px 14px', borderRadius: 10,
                fontSize: 12.5, fontWeight: 500, lineHeight: 1.4,
                background: error ? '#FEE2E2' : T.successBg,
                color: error ? T.danger : T.success,
                boxShadow: '0 8px 24px rgba(40,25,10,0.18)',
              }}
            >
              {error ? error : `✓ Backup erstellt — ${result!.recipe_count} Rezepte gesichert`}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '9px 12px', borderRadius: 9,
          border: `1px solid ${T.border}`, background: T.surface, color: T.text,
          fontSize: 13, fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.7 : 1,
        }}
      >
        <DownloadIcon size={16} />
        {busy ? 'Backup läuft…' : 'Backup erstellen'}
      </button>

      {result && (
        <p style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: T.successBg, color: T.success, fontSize: 11, lineHeight: 1.35, wordBreak: 'break-word' }}>
          ✓ {result.filename} · {result.recipe_count} Rezepte
        </p>
      )}
      {error && (
        <p style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: '#FEE2E2', color: T.danger, fontSize: 11, lineHeight: 1.35, wordBreak: 'break-word' }}>
          {error}
        </p>
      )}
    </div>
  )
}
