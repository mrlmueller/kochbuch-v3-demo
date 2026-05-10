// Deterministic, date-seeded helpers for picking/shuffling content on the
// Entdecken page. Same output all day for a given (date, section) pair;
// rotates at local midnight in Europe/Berlin.

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function todayKey(): string {
  // en-CA gives ISO-like YYYY-MM-DD formatting
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function rngFor(section: string): () => number {
  return mulberry32(hashString(`${todayKey()}|${section}`))
}

export function dailyShuffle<T>(items: readonly T[], section: string): T[] {
  const rand = rngFor(section)
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function dailyPick<T>(items: readonly T[], section: string): T | undefined {
  if (items.length === 0) return undefined
  const rand = rngFor(section)
  return items[Math.floor(rand() * items.length)]
}
