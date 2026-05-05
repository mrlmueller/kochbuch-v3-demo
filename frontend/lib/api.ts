const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// ─── Types ────────────────────────────────────────────

export interface Category {
  slug: string; name: string; description: string; accent: string
}
export interface Ingredient {
  amount: number; unit: string; display: string; name: string
}
export interface RecipeListItem {
  slug: string; title: string; category_slug: string
  time_minutes: number; servings: string
  image_url: string; image_blurhash: string
}
export interface Recipe extends RecipeListItem {
  ingredients: Ingredient[]; steps: string[]
  notes: string; created_at: string; updated_at: string
}
export interface RecipeFilter { category?: string; q?: string }
export interface User {
  id: string; email: string; role: 'admin' | 'user'
  status: 'active' | 'deactivated'
  created_at: string; last_login?: string
}

// ─── Client-side fetch (browser sends cookie automatically) ──

export async function clientLogin(idToken: string): Promise<User> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id_token: idToken }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function clientLogout(): Promise<void> {
  await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' })
}

export async function clientCreateUser(email: string): Promise<User> {
  const res = await fetch(`${API}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function clientUpdateUser(id: string, patch: { role?: string; status?: string }): Promise<User> {
  const res = await fetch(`${API}/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function clientDeleteUser(id: string): Promise<void> {
  await fetch(`${API}/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' })
}

export async function clientSaveRecipe(recipe: Partial<Recipe>, isNew: boolean): Promise<void> {
  const url = isNew ? `${API}/api/recipes` : `${API}/api/recipes/${recipe.slug}`
  const res = await fetch(url, {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(recipe),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function clientDeleteRecipe(slug: string): Promise<void> {
  await fetch(`${API}/api/recipes/${slug}`, { method: 'DELETE', credentials: 'include' })
}

export async function clientGetRecipes(filter: RecipeFilter = {}): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)
  const qs = params.toString()
  const res = await fetch(`${API}/api/recipes${qs ? `?${qs}` : ''}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`getRecipes: ${res.status}`)
  return res.json()
}
