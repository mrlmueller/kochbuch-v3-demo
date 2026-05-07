import { getAdminCategories } from '@/lib/api.server'
import { RecipeForm } from '@/app/admin/recipe-form'

export default async function NewRecipePage() {
  const categories = await getAdminCategories()
  return <RecipeForm categories={categories} mode="create" />
}
