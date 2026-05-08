import { Suspense } from 'react'
import { getCategories, getRecipes } from '@/lib/api.server'
import { BrowseClient } from './browse-client'
import RezepteLoading from './loading'

export const unstable_instant = { prefetch: 'static' as const }

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
