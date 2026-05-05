import { notFound } from 'next/navigation'
import { getRecipe, getCategories } from '@/lib/api'
import { RecipeForm } from '../recipe-form'

export default async function AdminEditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [recipe, categories] = await Promise.all([getRecipe(slug), getCategories()])
  if (!recipe) return notFound()
  return <RecipeForm categories={categories} initial={recipe} mode="edit" />
}
