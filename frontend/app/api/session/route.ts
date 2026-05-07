import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { session } = await req.json()
  if (!session) return NextResponse.json({ error: 'missing' }, { status: 400 })
  const store = await cookies()
  store.set('session', session, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const store = await cookies()
  store.delete('session')
  return NextResponse.json({ ok: true })
}
