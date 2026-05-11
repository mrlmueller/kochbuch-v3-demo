'use client'

import { useEffect, useState } from 'react'

export interface Me {
  id: string
  email: string
  role: 'admin' | 'user'
}

const STORAGE_KEY = 'kb:me-cache:v1'
const FRESH_FOR_MS = 60_000 // 60s — auth changes propagate within a minute

// In-process cache so multiple components on the same page share one fetch.
let inflight: Promise<Me | null> | null = null
let inMemory: { me: Me | null; ts: number } | null = null

interface Cached {
  me: Me | null
  ts: number
}

function readCache(): Cached | null {
  try {
    if (inMemory) return inMemory
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached
    inMemory = parsed
    return parsed
  } catch {
    return null
  }
}

function writeCache(me: Me | null) {
  const entry: Cached = { me, ts: Date.now() }
  inMemory = entry
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {}
}

async function fetchMe(): Promise<Me | null> {
  // Hit Next's session route which talks to the backend. We use the same
  // /api/proxy/auth/me-style endpoint via /api/auth/me. Backend returns
  // 401 when there's no session — we treat that as "not logged in".
  if (inflight) return inflight
  inflight = (async () => {
    try {
      // No /api/auth/me proxy is configured, but the backend route is on
      // the same origin behind the same session cookie at port 8080 in
      // dev — instead, route through the proxy by mounting /api/auth/me
      // there. Since the proxy is restricted to a fixed prefix list, we
      // use a dedicated frontend route that wraps the cookie+fetch.
      const res = await fetch('/api/me', { cache: 'no-store' })
      if (!res.ok) return null
      return await res.json() as Me
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// useMe returns the current logged-in user (or null) and a `loading`
// flag for the first paint when no cache is available. After the first
// resolve, subsequent renders use the sessionStorage cache so navigating
// between recipe pages is instant — no DB round-trip on every click.
export function useMe(): { me: Me | null; loading: boolean } {
  const [state, setState] = useState<{ me: Me | null; loading: boolean }>(() => {
    if (typeof window === 'undefined') return { me: null, loading: true }
    const cached = readCache()
    if (cached && Date.now() - cached.ts < FRESH_FOR_MS) {
      return { me: cached.me, loading: false }
    }
    return { me: cached?.me ?? null, loading: !cached }
  })

  useEffect(() => {
    let cancelled = false
    const cached = readCache()
    if (cached && Date.now() - cached.ts < FRESH_FOR_MS) {
      // Fresh enough — no refetch.
      return
    }
    fetchMe().then(me => {
      writeCache(me)
      if (!cancelled) setState({ me, loading: false })
    })
    return () => { cancelled = true }
  }, [])

  return state
}
