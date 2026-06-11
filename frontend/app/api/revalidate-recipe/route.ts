import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { revalidateTag } from 'next/cache'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const INTERNAL_TOKEN = process.env.INTERNAL_SSR_TOKEN ?? ''
// Recipe slugs are lowercase kebab; bound the length so arbitrary tags can't be churned.
const SLUG_RE = /^[a-z0-9-]{1,80}$/

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Gate the endpoint: it forces immediate cache expiry ({ expire: 0 }), which
  // turns the next request into a blocking re-render. Left open, an anonymous
  // caller could spam it to amplify load. Two callers are authorized:
  //   1. The backend AI worker (nutrition jobs finish in the background, after
  //      the admin's tab may be gone) — authenticated by the shared internal
  //      token, the same secret the SSR layer uses toward the backend.
  //   2. A logged-in browser session, verified against the backend (not just
  //      cookie presence).
  const headerToken = req.headers.get('x-internal-token')
  const internalOk = INTERNAL_TOKEN !== '' && headerToken === INTERNAL_TOKEN
  if (!internalOk) {
    const session = (await cookies()).get('session')
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const me = await fetch(`${API}/api/auth/me`, {
      headers: { Cookie: `session=${session.value}` },
      cache: 'no-store',
    }).catch(() => null)
    if (!me || !me.ok) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string }
  if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 })
  }

  // `{ expire: 0 }` expires immediately so the next request renders fresh.
  // 'max' would be stale-while-revalidate (the next visitor still sees old data).
  revalidateTag(`recipe-${slug}`, { expire: 0 })
  revalidateTag('recipes', { expire: 0 })
  return NextResponse.json({ revalidated: true })
}
