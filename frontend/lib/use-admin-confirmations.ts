'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMe } from '@/lib/use-me'
import { clientGetRecipeConfirmations, clientSetRecipeConfirmed } from '@/lib/api'

// Admin-only set of hand-confirmed (calibrated) recipe slugs.
//
// Stale-while-revalidate: the sessionStorage snapshot paints instantly, then a
// fresh no-store fetch on *every* mount refreshes it in the background. So a
// calibration toggle made anywhere shows up on the next /rezepte (or any) visit
// immediately — no cache TTL, no server restart. (An earlier version kept a 60s
// freshness gate AND re-stamped the cache timestamp on every mount, which froze
// the set so it only ever fetched once per session; that's the bug this fixes.)
//
// For non-admins the hook is inert: isAdmin is false, no request is ever made,
// and nothing about the public page changes. The admin check stays client-side
// on purpose so /rezepte remains statically prerendered.

const STORAGE_KEY = 'kb:confirmations:v1'

let inflight: Promise<string[]> | null = null

function readCache(): string[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Tolerate (ignore) any older/other cache shape — only a plain array is valid.
    return Array.isArray(parsed) ? (parsed as string[]) : null
  } catch {
    return null
  }
}

function writeCache(slugs: string[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slugs))
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
    return new Set(readCache() ?? [])
  })
  const [ready, setReady] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return readCache() != null
  })

  // Revalidate on every mount (admin only). The cached snapshot above already
  // painted; this refreshes it from the server in the background. setState only
  // happens inside the async .then, never synchronously in the effect body.
  useEffect(() => {
    if (!isAdmin) return
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

  // Persist the live set so the next mount can paint instantly. No timestamp,
  // so it can never gate (freeze) the revalidate above.
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
