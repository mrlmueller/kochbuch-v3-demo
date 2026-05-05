const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export interface Category {
  slug: string
  name: string
  description: string
  accent: string
}

export interface Ingredient {
  amount: number    // numeric (0 if unparseable)
  unit: string
  display: string   // original string e.g. "500 g"
  name: string
}

export interface RecipeListItem {
  slug: string
  title: string
  category_slug: string
  time_minutes: number
  servings: string
  image_url: string
  image_blurhash: string
}

export interface Recipe extends RecipeListItem {
  ingredients: Ingredient[]
  steps: string[]
  notes: string
  created_at: string
  updated_at: string
}

export interface RecipeFilter {
  category?: string
  q?: string
}

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${API}/api/categories`)
  if (!res.ok) throw new Error(`getCategories: ${res.status}`)
  return res.json()
}

export async function getRecipes(filter: RecipeFilter = {}): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)
  const qs = params.toString()
  const res = await fetch(`${API}/api/recipes${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`getRecipes: ${res.status}`)
  return res.json()
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  const res = await fetch(`${API}/api/recipes/${slug}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`getRecipe: ${res.status}`)
  return res.json()
}
