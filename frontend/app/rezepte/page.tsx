import { Suspense } from 'react'
import { getCategories, getRecipes } from '@/lib/api.server'
import { BrowseClient } from './browse-client'
import { BrowseSkeleton } from '@/components/skeleton'

export const revalidate = 60

async function BrowseContent({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  const [categories, recipes] = await Promise.all([
    getCategories(),
    getRecipes(),
  ])

  return <BrowseClient categories={categories} initialRecipes={recipes} initialCategory={category ?? 'all'} />
}

export default function RezeptePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  return (
    <Suspense fallback={<BrowseSkeleton />}>
      <BrowseContent searchParams={searchParams} />
    </Suspense>
  )
}
