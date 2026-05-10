import { getAdminRecipes, getAdminCategories } from '@/lib/api.server'
import { AdminRecipeList } from '@/components/admin/recipe-list'

export default async function AdminPage() {
  const [recipes, categories] = await Promise.all([getAdminRecipes('all'), getAdminCategories()])
  return <AdminRecipeList recipes={recipes} categories={categories} />
}
