import { getCategories } from '@/lib/api'
import { RecipeForm } from '@/app/admin/recipe-form'

export default async function NewRecipePage() {
  const categories = await getCategories()
  return <RecipeForm categories={categories} mode="create" />
}
