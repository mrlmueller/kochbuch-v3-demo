'use client'

import { useState } from 'react'
import type { Ingredient } from '@/lib/api'
import { formatIngredientAmount, isIngredientDivider, ingredientDividerTitle } from '@/lib/utils'

interface Props {
  ingredients: Ingredient[]
  // Serving multiplier, controlled by the parent (the −/+ now lives in the meta row).
  scale?: number
}

export function IngredientList({ ingredients, scale = 1 }: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    const next = new Set(checked)
    next.has(i) ? next.delete(i) : next.add(i)
    setChecked(next)
  }

  return (
    <div>
      {ingredients.length === 0 ? (
        <p style={{ padding: '12px 2px', fontSize: 14, color: 'var(--muted)' }}>Keine Zutaten angegeben.</p>
      ) : ingredients.map((ing, i) => {
        if (isIngredientDivider(ing)) {
          return (
            <div
              key={i}
              style={{
                padding: i === 0 ? '2px 2px 8px' : '18px 2px 8px',
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
            className="flex items-center gap-3 cursor-pointer"
            style={{
              padding: '13px 2px',
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
  )
}
