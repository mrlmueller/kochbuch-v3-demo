'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminConfirmations } from '@/lib/use-admin-confirmations'
import {
  clientComputeNutrition,
  clientGetNutritionDetail,
  type NutritionDetail,
} from '@/lib/api'

const T = {
  accent: '#C2410C',
  text: '#2A1F14',
  muted: '#7A6B5A',
  border: 'rgba(120,90,60,0.16)',
  bg: '#FAF6EF',
  danger: '#B91C1C',
  green: '#16A34A',
  amber: '#D97706',
}

interface Props {
  slug: string
}

export function NutritionControl({ slug }: Props) {
  const router = useRouter()
  const { isConfirmed } = useAdminConfirmations()
  const confirmed = isConfirmed(slug)

  const [detail, setDetail] = useState<NutritionDetail | null>(null)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState('')
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevComputedAt = useRef<string | undefined>(undefined)

  // Load current nutrition status on mount
  useEffect(() => {
    clientGetNutritionDetail(slug)
      .then((d) => {
        setDetail(d)
        prevComputedAt.current = d.computed_at
      })
      .catch(() => setDetail(null))
  }, [slug])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [])

  const stopPolling = () => {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const handleCompute = async () => {
    setError('')
    setComputing(true)
    prevComputedAt.current = detail?.computed_at

    try {
      await clientComputeNutrition(slug)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Starten')
      setComputing(false)
      return
    }

    // Poll every 3 s until a fresh result appears
    pollingRef.current = setInterval(async () => {
      try {
        const d = await clientGetNutritionDetail(slug)
        const hasResult = !!d.per_serving
        const isNewer =
          !prevComputedAt.current ||
          (!!d.computed_at && d.computed_at !== prevComputedAt.current)

        if (hasResult && isNewer) {
          stopPolling()
          setDetail(d)
          setComputing(false)
          // Bust the SSR cache so the public page picks up the card
          await fetch('/api/revalidate-recipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug }),
          }).catch(() => {/* best-effort */})
          router.refresh()
        }
      } catch {
        // keep polling; transient errors are normal while the job runs
      }
    }, 3000)
  }

  const hasData = detail && !detail.status

  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        background: T.bg,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>
          Nährwerte
        </span>

        {/* Status badge */}
        {computing ? (
          <span style={{ fontSize: 12, color: T.amber, fontStyle: 'italic' }}>läuft…</span>
        ) : hasData ? (
          <span style={{ fontSize: 12, color: T.muted }}>
            berechnet
            {typeof detail.cost_usd === 'number' && ` · $${detail.cost_usd.toFixed(3)}`}
            {detail.outdated && (
              <span
                style={{
                  marginLeft: 6,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: '#FEF3C7',
                  color: T.amber,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                veraltet
              </span>
            )}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: T.muted }}>keine</span>
        )}

        {/* Compute button */}
        <button
          type="button"
          disabled={!confirmed || computing}
          onClick={handleCompute}
          title={!confirmed ? 'Erst kalibrieren' : 'Nährwerte via KI berechnen'}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: 'none',
            background: !confirmed || computing ? T.border : T.accent,
            color: !confirmed || computing ? T.muted : '#fff',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: !confirmed || computing ? 'not-allowed' : 'pointer',
            opacity: computing ? 0.75 : 1,
          }}
        >
          {computing ? 'läuft…' : 'Nährwerte berechnen'}
        </button>
      </div>

      {/* Hint when not calibrated */}
      {!confirmed && (
        <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>
          Erst kalibrieren, um Nährwerte berechnen zu können.
        </p>
      )}

      {/* Per-serving summary when data is available */}
      {hasData && detail.per_serving && (
        <div style={{ fontSize: 12, color: T.text }}>
          <span style={{ fontWeight: 700 }}>{Math.round(detail.per_serving.kcal)} kcal</span>
          <span style={{ color: T.muted }}>/Portion</span>
          {detail.per_serving.protein_g != null && (
            <span style={{ color: T.muted, marginLeft: 8 }}>
              E {Math.round(detail.per_serving.protein_g)} g ·{' '}
              F {Math.round(detail.per_serving.fat_g)} g ·{' '}
              KH {Math.round(detail.per_serving.carbs_g)} g
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontSize: 12, color: T.danger, margin: 0 }}>{error}</p>
      )}
    </div>
  )
}
