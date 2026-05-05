import { Suspense } from 'react'
import { getCategories, getRecipes } from '@/lib/api.server'
import { BrowseClient } from './browse-client'
import { BrowseSkeleton } from '@/components/skeleton'

// Page is now fully static (ISR 5 min).
// Category + search filtering is handled client-side via useSearchParams in BrowseClient.
export const revalidate = 300

async function BrowseContent() {
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
