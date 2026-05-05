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
  if (amount === 0) return display  // unparseable — show as-is

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
