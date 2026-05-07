import { Suspense } from 'react'
import { requireAuth, getCategories, getRecipes } from '@/lib/api.server'
import { BrowseClient } from './browse-client'
import { BrowseSkeleton } from '@/components/skeleton'

export const dynamic = 'force-dynamic'

async function BrowseContent() {
  await requireAuth()
  const [categories, recipes] = await Promise.all([
    getCategories(),
    getRecipes(),
  ])

  return (
    // Suspense required because BrowseClient uses useSearchParams()
    <Suspense fallback={<BrowseSkeleton />}>
      <BrowseClient categories={categories} initialRecipes={recipes} />
    </Suspense>
  )
}

export default function RezeptePage() {
  return (
    <Suspense fallback={<BrowseSkeleton />}>
      <BrowseContent />
    </Suspense>
  )
}
