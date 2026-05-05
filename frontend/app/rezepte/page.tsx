import { getCategories, getRecipes } from '@/lib/api'
import { BrowseClient } from './browse-client'

export const revalidate = 60

export default async function RezeptePage({
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
