import { notFound } from 'next/navigation'
import { getRecipe, getCategories } from '@/lib/api'
import { DetailClient } from './detail-client'

export const revalidate = 60

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [recipe, categories] = await Promise.all([
    getRecipe(slug),
    getCategories(),
  ])

  if (!recipe) notFound()

  const category = categories.find((c) => c.slug === recipe.category_slug)
  return <DetailClient recipe={recipe} categoryName={category?.name ?? ''} />
}
