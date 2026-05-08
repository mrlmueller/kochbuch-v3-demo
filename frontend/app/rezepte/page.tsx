import { Suspense } from 'react'
import { getCategories, getRecipes } from '@/lib/api.server'
import { BrowseClient } from './browse-client'
import RezepteLoading from './loading'

export const unstable_instant = {
  prefetch: 'static',
  // BrowseClient reads these via useSearchParams() inside a Suspense boundary;
  // declaring them lets unstable_instant validate that the static shell
  // handles their presence/absence correctly.
  samples: [{ searchParams: { category: null, q: null } }],
}

export default async function RezeptePage() {
  const [categories, recipes] = await Promise.all([
    getCategories(),
    getRecipes(),
  ])

  return (
    // Suspense required because BrowseClient uses useSearchParams()
    <Suspense fallback={<RezepteLoading />}>
      <BrowseClient categories={categories} initialRecipes={recipes} />
    </Suspense>
  )
}
