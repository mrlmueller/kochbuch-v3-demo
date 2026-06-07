'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { clientSessionValid, clientLogout } from '@/lib/api'

// Boots a window whose session has been invalidated elsewhere (single-session
// enforcement). The backend already kills the old session on a new login, but
// proxy.ts gates on cookie *presence* and pages are cached anonymous SSR, so a
// stale window keeps browsing until it makes an authenticated call. This guard
// closes that gap WITHOUT per-request validation: it checks only on mount, when
// the window regains focus / becomes visible (the moment a user returns to a
// stale window), and on a slow 60s backstop while visible. Zero cost while idle
// or hidden.

const PUBLIC_PREFIXES = ['/login', '/auth/action']
const MIN_INTERVAL_MS = 30_000

export function SessionGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const busy = useRef(false)
  const lastAt = useRef(0)

  useEffect(() => {
    if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return
    let cancelled = false

    const check = async (force: boolean) => {
      if (busy.current || document.visibilityState === 'hidden') return
      if (!force && Date.now() - lastAt.current < MIN_INTERVAL_MS) return
      busy.current = true
      lastAt.current = Date.now()
      try {
        const valid = await clientSessionValid()
        if (!valid && !cancelled) {
          try { await clientLogout() } catch { /* ignore */ }
          router.replace('/login')
        }
      } finally {
        busy.current = false
      }
    }

    check(false) // initial (throttled, so rapid navigations don't re-ping)
    const onFocus = () => check(true)
    const onVisible = () => { if (document.visibilityState === 'visible') check(true) }
    const id = window.setInterval(() => check(false), 60_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pathname, router])

  return null
}
