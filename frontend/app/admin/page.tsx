import { getRecipes, getCategories } from '@/lib/api'
import { AdminRecipeList } from '@/components/admin/recipe-list'

export default async function AdminPage() {
  const [recipes, categories] = await Promise.all([getRecipes(), getCategories()])
  return <AdminRecipeList recipes={recipes} categories={categories} />
}
