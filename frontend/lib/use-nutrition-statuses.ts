'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useMe } from '@/lib/use-me'
import { clientGetNutritionStatuses } from '@/lib/api'

// Admin-only map of recipe-slug → nutrition status ('current' | 'outdated').
//
// Mirrors use-admin-confirmations.ts exactly in structure:
// - Stale-while-revalidate: sessionStorage snapshot paints instantly, then a
//   fresh no-store fetch on every mount refreshes it in the background.
// - Hydration safety: the admin list is statically prerendered with no viewer
//   context, so the server HTML never contains admin-only markers. ALL admin
//   output is withheld until after hydration (useHydrated) to avoid mismatches.
// - Non-admins: the hook is inert — isAdmin is false, no request is ever made.

const STORAGE_KEY = 'kb:nutrition-status:v1'

let inflight: Promise<Record<string, 'current' | 'outdated'>> | null = null

function readCache(): Record<string, 'current' | 'outdated'> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Only accept a plain object (not null, not array).
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, 'current' | 'outdated'>
    }
    return null
  } catch {
    return null
  }
}

function writeCache(statuses: Record<string, 'current' | 'outdated'>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(statuses))
  } catch {}
}

function fetchNutritionStatuses(): Promise<Record<string, 'current' | 'outdated'>> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      return await clientGetNutritionStatuses()
    } catch {
      return {}
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

export interface NutritionStatuses {
  isAdmin: boolean
  ready: boolean
  nutritionStatus: (slug: string) => 'none' | 'current' | 'outdated'
}

export function useNutritionStatuses(): NutritionStatuses {
  const { me } = useMe()
  const hydrated = useHydrated()
  const isAdmin = hydrated && me?.role === 'admin'

  const [statuses, setStatuses] = useState<Record<string, 'current' | 'outdated'>>(() => {
    if (typeof window === 'undefined') return {}
    return readCache() ?? {}
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
    fetchNutritionStatuses().then((data) => {
      if (cancelled) return
      setStatuses(data)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  // Persist the live map so the next mount can paint instantly.
  useEffect(() => {
    if (isAdmin && readyState) writeCache(statuses)
  }, [statuses, isAdmin, readyState])

  // Every output is gated on `hydrated` so the first client render matches the
  // viewer-less server HTML (no admin UI), eliminating hydration mismatches.
  const nutritionStatus = useCallback(
    (slug: string): 'none' | 'current' | 'outdated' => {
      if (!hydrated) return 'none'
      return statuses[slug] ?? 'none'
    },
    [hydrated, statuses],
  )

  return { isAdmin: !!isAdmin, ready: hydrated && readyState, nutritionStatus }
}
