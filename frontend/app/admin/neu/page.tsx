import { getAdminCategories } from '@/lib/api.server'
import { RecipeForm } from '@/components/recipe-form'

export default async function NewRecipePage() {
  const categories = await getAdminCategories()
  return <RecipeForm categories={categories} mode="create" isAdmin={true} />
}
