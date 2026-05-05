import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

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

// ─── Server-side fetch (forwards session cookie) ──────

async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      ...(session ? { Cookie: `session=${session.value}` } : {}),
    },
    cache: 'no-store',
  })
  if (res.status === 401 || res.status === 403) redirect('/login')
  return res
}

// ─── Public API (server components) ──────────────────

export async function getCategories(): Promise<Category[]> {
  const res = await serverFetch('/api/categories')
  if (!res.ok) throw new Error(`getCategories: ${res.status}`)
  return res.json()
}

export async function getRecipes(filter: RecipeFilter = {}): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)
  const qs = params.toString()
  const res = await serverFetch(`/api/recipes${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`getRecipes: ${res.status}`)
  return res.json()
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  const res = await serverFetch(`/api/recipes/${slug}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`getRecipe: ${res.status}`)
  return res.json()
}

export async function getMe(): Promise<User | null> {
  try {
    const res = await serverFetch('/api/auth/me')
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getAdminUsers(): Promise<User[]> {
  const res = await serverFetch('/api/admin/users')
  if (!res.ok) throw new Error(`getAdminUsers: ${res.status}`)
  return res.json()
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
