'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useMe } from '@/lib/use-me'
import { clientGetRecipeConfirmations, clientSetRecipeConfirmed } from '@/lib/api'

// Admin-only set of hand-confirmed (calibrated) recipe slugs.
//
// Stale-while-revalidate: the sessionStorage snapshot paints instantly, then a
// fresh no-store fetch on every mount refreshes it in the background. So a
// calibration toggle made anywhere shows up on the next visit immediately — no
// cache TTL, no server restart.
//
// Hydration safety: /rezepte and the recipe pages are statically prerendered
// with NO viewer (the server can't know you're an admin), so the server HTML
// never contains the admin-only markers. We therefore withhold ALL admin output
// until after hydration (useHydrated) — otherwise a warm client cache would
// render markers on the first client render and mismatch the server HTML.
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

// false on the server and during the first (hydration) client render, true
// afterward — without a setState-in-effect. Lets admin-only UI stay absent
// until the client has hydrated, matching the viewer-less server HTML.
const subscribeNoop = () => () => {}
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
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
  const hydrated = useHydrated()
  const isAdmin = hydrated && me?.role === 'admin'

  const [confirmed, setConfirmedState] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    return new Set(readCache() ?? [])
  })
  const [readyState, setReady] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return readCache() != null
  })

  // Revalidate on every mount once we know the viewer is an admin (post-
  // hydration). setState only happens inside the async .then, never synchronously.
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

  // Persist the live set so the next mount can paint instantly.
  useEffect(() => {
    if (isAdmin && readyState) writeCache(Array.from(confirmed))
  }, [confirmed, isAdmin, readyState])

  // Every output is gated on `hydrated` so the first client render matches the
  // viewer-less server HTML (no admin UI), eliminating hydration mismatches.
  const isConfirmed = useCallback(
    (slug: string) => hydrated && confirmed.has(slug),
    [hydrated, confirmed],
  )

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

  return { isAdmin: !!isAdmin, ready: hydrated && readyState, isConfirmed, setConfirmed }
}
