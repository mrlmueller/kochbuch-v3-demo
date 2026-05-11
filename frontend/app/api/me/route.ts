// Tiny wrapper around the backend's /api/auth/me. Exists so client
// components can hit /api/me directly — keeps the proxy allowlist focused
// on the data prefixes that benefit from cache invalidation and gives us
// one place to cap the response time.
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function GET(): Promise<NextResponse> {
  const session = (await cookies()).get('session')
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 3s ceiling — if the backend is slow, fail fast so the client cache
  // takes over rather than blocking the UI thread.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)

  try {
    const res = await fetch(`${API}/api/auth/me`, {
      cache: 'no-store',
      headers: { Cookie: `session=${session.value}` },
      signal: controller.signal,
    })
    if (!res.ok) return NextResponse.json({ error: 'unauthorized' }, { status: res.status })
    const body = await res.text()
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: 'backend unavailable' }, { status: 503 })
  } finally {
    clearTimeout(timer)
  }
}
