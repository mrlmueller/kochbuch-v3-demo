import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Category, RecipeListItem, Recipe, RecipeFilter, User } from './api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')

  const res = await fetch(`${API}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      ...(session ? { Cookie: `session=${session.value}` } : {}),
    },
  })
  if (res.status === 401 || res.status === 403) redirect('/login')
  return res
}

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
