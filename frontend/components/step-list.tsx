'use client'

import { useState } from 'react'

interface Props {
  steps: string[]
}

export function StepList({ steps }: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    const next = new Set(checked)
    next.has(i) ? next.delete(i) : next.add(i)
    setChecked(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {steps.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Keine Schritte angegeben.</p>
      ) : steps.map((step, i) => {
        const isChecked = checked.has(i)
        return (
          <div
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => toggle(i)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(i) }}
            className="flex gap-4 p-4 rounded-2xl cursor-pointer"
            style={{
              background: 'var(--card-bg)',
              boxShadow: 'var(--card-shadow)',
              opacity: isChecked ? 0.5 : 1,
            }}
          >
            {isChecked ? (
              <div className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 28, height: 28,
                  background: 'var(--accent)',
                  border: `1.5px solid var(--accent)`,
                }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
            ) : (
              <span style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 36,
                fontStyle: 'italic',
                fontWeight: 400,
                color: 'var(--accent)',
                opacity: 0.35,
                lineHeight: 1,
                minWidth: 32,
                flexShrink: 0,
              }}>
                {i + 1}
              </span>
            )}
            <p className="flex-1" style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.55, textDecoration: isChecked ? 'line-through' : 'none' }}>
              {step}
            </p>
          </div>
        )
      })}
    </div>
  )
}
