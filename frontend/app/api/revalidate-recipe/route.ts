import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string }
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug required' }, { status: 400 })
  }
  // `{ expire: 0 }` expires immediately so the next request renders fresh.
  // 'max' would be stale-while-revalidate (the next visitor still sees old data).
  revalidateTag(`recipe-${slug}`, { expire: 0 })
  revalidateTag('recipes', { expire: 0 })
  return NextResponse.json({ revalidated: true })
}
