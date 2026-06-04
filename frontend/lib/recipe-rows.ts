import type { Ingredient } from '@/lib/api'
import { isIngredientDivider, ingredientDividerTitle } from '@/lib/utils'

/**
 * Form-internal row shapes. The editor keeps a stable `id` per row (for drag &
 * undo) plus a discriminator so a section heading lives in the *same* list as
 * the ingredients and reorders with the same mechanism. The wire format is
 * unchanged: dividers serialize back to `{ display: '---', name: 'Titel:' }`.
 */
export type IngredientRow =
  | { id: string; kind: 'item'; display: string; name: string }
  | { id: string; kind: 'divider'; title: string }

export interface StepRow {
  id: string
  text: string
}

/** Payload shape consumed by `clientSaveRecipe` (matches the existing form output). */
export interface IngredientPayload {
  display: string
  name: string
  amount: number
  unit: string
}

// SSR-seeded rows use index-based ids so server and client first render match;
// runtime-added rows use uid() instead (see use-editable-list).
export function toIngredientRows(ings: Ingredient[] | undefined): IngredientRow[] {
  if (!ings?.length) return [{ id: 'ing-0', kind: 'item', display: '', name: '' }]
  return ings.map((i, idx) => {
    if (isIngredientDivider({ display: i.display ?? '' })) {
      return { id: `ing-${idx}`, kind: 'divider', title: ingredientDividerTitle({ name: i.name }) }
    }
    return {
      id: `ing-${idx}`,
      kind: 'item',
      display: i.display || `${i.amount ?? ''} ${i.unit ?? ''}`.trim(),
      name: i.name,
    }
  })
}

export function toStepRows(steps: string[] | undefined): StepRow[] {
  if (!steps?.length) return [{ id: 'step-0', text: '' }]
  return steps.map((text, idx) => ({ id: `step-${idx}`, text }))
}

/** Drop empty rows; dividers become the `---` marker with a colon-terminated title. */
export function ingredientRowsToPayload(rows: IngredientRow[]): IngredientPayload[] {
  return rows.flatMap((r) => {
    if (r.kind === 'divider') {
      const t = r.title.trim()
      if (!t) return []
      return [{ display: '---', name: t.endsWith(':') ? t : `${t}:`, amount: 0, unit: '' }]
    }
    if (!r.name.trim()) return []
    return [{ display: r.display, name: r.name, amount: 0, unit: '' }]
  })
}

export function stepRowsToPayload(rows: StepRow[]): string[] {
  return rows.map((r) => r.text).filter((t) => t.trim() !== '')
}
