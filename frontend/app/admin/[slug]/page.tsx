import { notFound } from 'next/navigation'
import { getAdminCategories, getRecipe } from '@/lib/api.server'
import { RecipeForm } from '@/app/admin/recipe-form'

export default async function EditRecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [categories, recipe] = await Promise.all([getAdminCategories(), getRecipe(slug)])
  if (!recipe) return notFound()
  return <RecipeForm categories={categories} initial={recipe} mode="edit" />
}
