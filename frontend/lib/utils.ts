import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Parse servings string to number. Falls back to defaultVal. */
export function parseServings(s: string, defaultVal = 4): number {
  const n = parseInt(s, 10)
  return isNaN(n) || n <= 0 ? defaultVal : n
}

/**
 * A section divider inside the ingredient list. The AI/editor encodes these as
 * an ingredient whose amount marker is exactly "---" (see backend prompt); the
 * name is the section title, e.g. "Mürbeteig:". Such rows are headings, not
 * checkable ingredients.
 */
export function isIngredientDivider(ing: { display: string }): boolean {
  return ing.display.trim() === '---'
}

/** Section title for a divider row, without any trailing colon. */
export function ingredientDividerTitle(ing: { name: string }): string {
  return ing.name.replace(/\s*:\s*$/, '').trim()
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

/**
 * Parse a free-text amount string into a numeric quantity + trailing unit so it
 * can be scaled. The AI extraction pipeline stores the whole quantity as text in
 * `display` (e.g. "200 g", "2 EL", "½ TL") with amount 0, so without this those
 * amounts could never scale with the serving control.
 *
 * Returns null when there's nothing numeric to scale ("nach Bedarf", "etwas")
 * or for ranges like "2-3 EL" — callers should then show the text unchanged.
 */
export function parseDisplayAmount(display: string): { amount: number; unit: string } | null {
  const s = display.trim()
  if (!s) return null
  // Ranges ("2-3 EL", "2–3 EL") have no single value to scale — leave as-is.
  if (/^[\d.,]+\s*[-–]\s*[\d.,]/.test(s)) return null
  const m = s.match(/^([0-9]+(?:[.,][0-9]+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*(.*)$/u)
  if (!m) return null
  const tok = m[1]
  const amount = tok in UNICODE_FRACTIONS ? UNICODE_FRACTIONS[tok] : parseFloat(tok.replace(',', '.'))
  if (!isFinite(amount) || amount <= 0) return null
  return { amount, unit: m[2].trim() }
}

/**
 * Format an ingredient amount with serving scale and unit conversion.
 * Returns the display string to show (e.g. "750 g", "3 EL", "nach Bedarf").
 */
export function formatIngredientAmount(
  amount: number,
  unit: string,
  display: string,
  scale: number,
  unitMode: 'metric' | 'imperial' | 'cups'
): string {
  if (amount === 0) {
    // AI-extracted recipes carry the quantity as free text in `display` (amount
    // 0). Parse it so they scale too; fall back to the raw text when there's
    // nothing numeric to scale (e.g. "nach Bedarf", section dividers).
    const parsed = parseDisplayAmount(display)
    if (!parsed) return display
    amount = parsed.amount
    unit = parsed.unit
  }

  let a = amount * scale
  let u = unit

  if (unitMode === 'imperial') {
    if (u === 'g')  { a = a / 28.35;  u = 'oz' }
    else if (u === 'kg') { a = a * 2.205;  u = 'lb' }
    else if (u === 'ml') { a = a / 29.57;  u = 'fl oz' }
    else if (u === 'l' || u === 'Liter') { a = a * 4.227; u = 'cups' }
  } else if (unitMode === 'cups') {
    if (u === 'g') {
      if (a >= 120) { a = a / 120; u = 'cups' }
      else { a = Math.round(a / 8); u = 'EL' }
    } else if (u === 'ml') {
      if (a >= 240) { a = a / 240; u = 'cups' }
      else if (a >= 15) { a = a / 15; u = 'EL' }
      else { a = a / 5; u = 'TL' }
    }
  }

  // Round display value
  let rounded: string
  if (a >= 100) rounded = Math.round(a).toString()
  else if (a >= 10) rounded = (Math.round(a * 10) / 10).toString()
  else rounded = (Math.round(a * 100) / 100).toString()

  return u ? `${rounded} ${u}` : rounded
}
