'use client'

import { useState } from 'react'
import type { Ingredient } from '@/lib/api'
import { formatIngredientAmount, parseServings, isIngredientDivider, ingredientDividerTitle } from '@/lib/utils'

interface Props {
  ingredients: Ingredient[]
  servingsRaw: string
}

export function IngredientList({ ingredients, servingsRaw }: Props) {
  const baseServings = parseServings(servingsRaw)
  const [scale, setScale] = useState(1)
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    const next = new Set(checked)
    next.has(i) ? next.delete(i) : next.add(i)
    setChecked(next)
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Für</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}
              className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border-none"
              style={{ background: 'var(--bg)', color: 'var(--text)' }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(baseServings * scale)}
            </span>
            <button type="button" onClick={() => setScale((s) => s + 0.25)}
              className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border-none"
              style={{ background: 'var(--bg)', color: 'var(--text)' }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Pers.</span>
        </div>
      </div>

      {/* Ingredient rows */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
        {ingredients.length === 0 ? (
          <p style={{ padding: '12px 16px', fontSize: 14, color: 'var(--muted)' }}>Keine Zutaten angegeben.</p>
        ) : ingredients.map((ing, i) => {
          if (isIngredientDivider(ing)) {
            return (
              <div
                key={i}
                style={{
                  padding: i === 0 ? '12px 16px 6px' : '18px 16px 6px',
                  borderBottom: i < ingredients.length - 1 ? '0.5px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--accent)' }}>
                  {ingredientDividerTitle(ing)}
                </span>
              </div>
            )
          }
          const isChecked = checked.has(i)
          const amountStr = formatIngredientAmount(ing.amount, ing.unit, ing.display, scale, 'metric')
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => toggle(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(i) }}
              className="flex items-center gap-3 px-4 cursor-pointer"
              style={{
                padding: '12px 16px',
                borderBottom: i < ingredients.length - 1 ? '0.5px solid var(--border)' : 'none',
                opacity: isChecked ? 0.42 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <div className="flex-shrink-0 flex items-center justify-center rounded-md"
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: `1.5px solid ${isChecked ? 'var(--accent)' : 'var(--border)'}`,
                  background: isChecked ? 'var(--accent)' : 'transparent',
                }}>
                {isChecked && (
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </div>
              <span className="flex-1" style={{ fontSize: 14.5, color: 'var(--text)', textDecoration: isChecked ? 'line-through' : 'none' }}>
                {ing.name}
              </span>
              <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {amountStr}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
