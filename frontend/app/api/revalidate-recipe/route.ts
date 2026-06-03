import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string }
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug required' }, { status: 400 })
  }
  revalidateTag(`recipe-${slug}`, 'max')
  revalidateTag('recipes', 'max')
  return NextResponse.json({ revalidated: true })
}
