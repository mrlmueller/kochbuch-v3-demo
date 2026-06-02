'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMe } from '@/lib/use-me'
import { clientGetRecipeConfirmations, clientSetRecipeConfirmed } from '@/lib/api'

// Admin-only hook exposing which recipes have been hand-confirmed
// (calibrated). Mirrors useMe(): the set is sessionStorage-cached and shared
// via an in-flight promise so the badges appear instantly when navigating
// between pages, and the network round-trip happens at most once per minute.
//
// For non-admins this is inert — `isAdmin` is false, the set stays empty, and
// no request is ever made. Nothing about the public experience changes.

const STORAGE_KEY = 'kb:confirmations:v1'
const FRESH_FOR_MS = 60_000

interface Cached {
  slugs: string[]
  ts: number
}

let inflight: Promise<string[]> | null = null

function readCache(): Cached | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Cached
  } catch {
    return null
  }
}

function writeCache(slugs: string[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ slugs, ts: Date.now() } satisfies Cached))
  } catch {}
}

function fetchConfirmations(): Promise<string[]> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      return await clientGetRecipeConfirmations()
    } catch {
      return []
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export interface AdminConfirmations {
  isAdmin: boolean
  ready: boolean
  isConfirmed: (slug: string) => boolean
  /** Optimistically toggles, then PATCHes. Reverts the local set on failure. */
  setConfirmed: (slug: string, confirmed: boolean) => Promise<void>
}

export function useAdminConfirmations(): AdminConfirmations {
  const { me } = useMe()
  const isAdmin = me?.role === 'admin'

  const [confirmed, setConfirmedState] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    return new Set(readCache()?.slugs ?? [])
  })
  const [ready, setReady] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const c = readCache()
    return !!c && Date.now() - c.ts < FRESH_FOR_MS
  })

  useEffect(() => {
    if (!isAdmin) return
    const c = readCache()
    if (c && Date.now() - c.ts < FRESH_FOR_MS) {
      // Initial state already reflects the fresh cache (read in the useState
      // initializers above) — nothing to fetch or set. Mirrors useMe().
      return
    }
    let cancelled = false
    fetchConfirmations().then((slugs) => {
      if (cancelled) return
      setConfirmedState(new Set(slugs))
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  // Keep the cache in sync with the live set so toggles persist across nav.
  useEffect(() => {
    if (isAdmin && ready) writeCache(Array.from(confirmed))
  }, [confirmed, isAdmin, ready])

  const isConfirmed = useCallback((slug: string) => confirmed.has(slug), [confirmed])

  const setConfirmed = useCallback(async (slug: string, value: boolean) => {
    setConfirmedState((prev) => {
      const next = new Set(prev)
      if (value) next.add(slug)
      else next.delete(slug)
      return next
    })
    try {
      await clientSetRecipeConfirmed(slug, value)
    } catch (e) {
      // Revert on failure.
      setConfirmedState((prev) => {
        const next = new Set(prev)
        if (value) next.delete(slug)
        else next.add(slug)
        return next
      })
      throw e
    }
  }, [])

  return { isAdmin: !!isAdmin, ready, isConfirmed, setConfirmed }
}
