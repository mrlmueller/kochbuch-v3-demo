import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

type Context = { params: Promise<{ path: string[] }> }

async function handle(req: NextRequest, ctx: Context): Promise<NextResponse> {
  const { path } = await ctx.params
  const cookieStore = await cookies()
  const session = cookieStore.get('session')

  const target = new URL(`${API}/api/${path.join('/')}`)
  req.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v))

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method)

  const res = await fetch(target, {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Cookie: `session=${session.value}` } : {}),
    },
    ...(hasBody ? { body: await req.text() } : {}),
    cache: 'no-store',
  })

  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
  })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
