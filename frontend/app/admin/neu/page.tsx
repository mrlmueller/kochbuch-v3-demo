import { getCategories } from '@/lib/api'
import { RecipeForm } from '../recipe-form'

export default async function AdminNeuPage() {
  const categories = await getCategories()
  return <RecipeForm categories={categories} mode="create" />
}
