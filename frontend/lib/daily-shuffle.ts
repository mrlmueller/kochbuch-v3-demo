// Deterministic, date-seeded helpers for picking/shuffling content on the
// Entdecken page. Same output all day for a given (date, section) pair;
// rotates at local midnight in Europe/Berlin.
//
// `getTodayKey` is wrapped in a Cache Component (`use cache` + cacheLife) so
// Next 16's prerenderer accepts the `new Date()` access. Shuffle/pick are
// pure functions that take the date string as input.

import { cacheLife } from 'next/cache'

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

export async function getTodayKey(): Promise<string> {
  'use cache'
  cacheLife('hours')
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function rngFor(today: string, section: string): () => number {
  return mulberry32(hashString(`${today}|${section}`))
}

export function dailyShuffle<T>(items: readonly T[], today: string, section: string): T[] {
  const rand = rngFor(today, section)
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function dailyPick<T>(items: readonly T[], today: string, section: string): T | undefined {
  if (items.length === 0) return undefined
  const rand = rngFor(today, section)
  return items[Math.floor(rand() * items.length)]
}
