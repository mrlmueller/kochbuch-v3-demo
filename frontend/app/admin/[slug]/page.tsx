import { notFound } from 'next/navigation'
import { getAdminCategories, getRecipeAuthed } from '@/lib/api.server'
import { RecipeForm } from '@/components/recipe-form'
import { NutritionControl } from '@/components/admin/nutrition-control'

export default async function EditRecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [categories, recipe] = await Promise.all([getAdminCategories(), getRecipeAuthed(slug)])
  if (!recipe) return notFound()
  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <NutritionControl slug={slug} />
      </div>
      <RecipeForm categories={categories} initial={recipe} mode="edit" isAdmin={true} />
    </div>
  )
}
