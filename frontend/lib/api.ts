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

// ─── Helpers ──────────────────────────────────────────────────

async function throwIfError(res: Response): Promise<void> {
  if (res.ok) return
  let msg = `HTTP ${res.status}`
  try {
    const body = await res.json()
    if (typeof body.error === 'string') msg = body.error
  } catch {}
  throw new Error(msg)
}

// ─── Client-side fetch (browser sends cookie automatically) ──

export async function clientLogin(idToken: string): Promise<User> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id_token: idToken }),
  })
  await throwIfError(res)
  const data = await res.json()

  if (data.session_token) {
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: data.session_token }),
    })
  }

  const { session_token: _t, ...user } = data
  return user as User
}

export async function clientLogout(): Promise<void> {
  await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' })
  await fetch('/api/session', { method: 'DELETE' })
}

export async function clientCreateUser(email: string): Promise<User> {
  const res = await fetch('/api/proxy/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  await throwIfError(res)
  return res.json()
}

export async function clientUpdateUser(id: string, patch: { role?: string; status?: string }): Promise<User> {
  const res = await fetch(`/api/proxy/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  await throwIfError(res)
  return res.json()
}

export async function clientDeleteUser(id: string): Promise<void> {
  await fetch(`/api/proxy/admin/users/${id}`, { method: 'DELETE' })
}

export async function clientSaveRecipe(recipe: Partial<Recipe>, isNew: boolean): Promise<void> {
  const url = isNew ? '/api/proxy/recipes' : `/api/proxy/recipes/${recipe.slug}`
  const res = await fetch(url, {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  })
  await throwIfError(res)
}

export async function clientDeleteRecipe(slug: string): Promise<void> {
  await fetch(`/api/proxy/recipes/${slug}`, { method: 'DELETE' })
}

export async function clientGetRecipes(filter: RecipeFilter = {}): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)
  const qs = params.toString()
  const res = await fetch(`/api/proxy/recipes${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`getRecipes: ${res.status}`)
  return res.json()
}
