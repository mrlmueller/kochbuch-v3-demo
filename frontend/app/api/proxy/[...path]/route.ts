import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// Only these backend path prefixes may be proxied.
// The backend enforces its own auth; this is an extra layer of constraint.
const ALLOWED_PREFIXES = [
  '/api/auth/me',
  '/api/recipes',
  '/api/admin/users',
  '/api/admin/recipes',
  '/api/admin/ai-stats',
  '/api/admin/backup',
  '/api/ai-jobs',
  '/api/image-search',
]

const MAX_BODY_BYTES = 512 * 1024 // 512 KB

type Context = { params: Promise<{ path: string[] }> }

async function handle(req: NextRequest, ctx: Context): Promise<NextResponse> {
  const { path } = await ctx.params
  const backendPath = `/api/${path.join('/')}`

  if (!ALLOWED_PREFIXES.some((p) => backendPath.startsWith(p))) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const cookieStore = await cookies()
  const session = cookieStore.get('session')

  const target = new URL(`${API}${backendPath}`)
  req.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v))

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method)
  let body: string | undefined
  if (hasBody) {
    const cl = req.headers.get('content-length')
    if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) {
      return new NextResponse('Payload too large', { status: 413 })
    }
    body = await req.text()
    if (body.length > MAX_BODY_BYTES) {
      return new NextResponse('Payload too large', { status: 413 })
    }
  }

  const res = await fetch(target, {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Cookie: `session=${session.value}` } : {}),
    },
    ...(hasBody ? { body } : {}),
    cache: 'no-store',
  })

  // 204/205/304 are null-body statuses — Response constructor throws if any
  // body (including '') is passed alongside them. Read the body only when
  // the status allows one.
  const isNullBody = res.status === 204 || res.status === 205 || res.status === 304
  const resBody = isNullBody ? null : await res.text()

  // Invalidate caches after successful recipe mutations so every user sees
  // fresh data immediately. `{ expire: 0 }` expires the tag right away, so the
  // next request is a blocking cache miss that renders fresh — unlike 'max',
  // which is stale-while-revalidate and serves the old data to the next visitor.
  if (res.ok && backendPath.startsWith('/api/recipes')) {
    if (req.method === 'POST') {
      revalidateTag('recipes', { expire: 0 })
    } else if (req.method === 'PUT' || req.method === 'DELETE') {
      const slug = path[1]
      if (slug) revalidateTag(`recipe-${slug}`, { expire: 0 })
      revalidateTag('recipes', { expire: 0 })
    }
  }

  return new NextResponse(resBody, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
  })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
