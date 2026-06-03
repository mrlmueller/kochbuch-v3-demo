'use client'

import { useState } from 'react'

interface Props {
  steps: string[]
}

// Flat preparation steps — a big italic, zero-padded accent number beside the
// step text (matching the desktop detail + the reference). Tapping a step
// checks it off (dim + strike-through); no boxy per-step cards.
export function StepList({ steps }: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    const next = new Set(checked)
    next.has(i) ? next.delete(i) : next.add(i)
    setChecked(next)
  }

  if (steps.length === 0) {
    return <p style={{ fontSize: 14, color: 'var(--muted)' }}>Keine Schritte angegeben.</p>
  }

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      {steps.map((step, i) => {
        const isChecked = checked.has(i)
        return (
          <div
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => toggle(i)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(i) }}
            className="flex cursor-pointer"
            style={{ gap: 16, opacity: isChecked ? 0.5 : 1, transition: 'opacity 0.15s' }}
          >
            <span style={{
              fontFamily: 'var(--font-serif)', fontSize: 34, fontStyle: 'italic', fontWeight: 400,
              color: 'var(--accent)', lineHeight: 1, minWidth: 40, flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="flex-1" style={{
              fontSize: 15, color: 'var(--text)', lineHeight: 1.6, fontFamily: 'var(--font-serif)',
              paddingTop: 3, textDecoration: isChecked ? 'line-through' : 'none',
            }}>
              {step}
            </p>
          </div>
        )
      })}
    </div>
  )
}
