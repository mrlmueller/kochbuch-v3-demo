import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Category, RecipeListItem, Recipe, RecipeFilter, User } from './api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// revalidate=number → Next.js data cache with ISR; revalidate=false → no-store (auth/mutations)
async function serverFetch(path: string, revalidate: number | false = false, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')

  const cacheOpts: RequestInit = revalidate === false
    ? { cache: 'no-store' }
    : { next: { revalidate } }

  const res = await fetch(`${API}${path}`, {
    ...init,
    ...cacheOpts,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      ...(session ? { Cookie: `session=${session.value}` } : {}),
    },
  })
  if (res.status === 401 || res.status === 403) redirect('/login')
  return res
}

// ─── Public (cached) ─────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  // Categories rarely change — cache for 1 hour
  const res = await serverFetch('/api/categories', 3600)
  if (!res.ok) throw new Error(`getCategories: ${res.status}`)
  return res.json()
}

export async function getRecipes(filter: RecipeFilter = {}): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)
  const qs = params.toString()
  // Search results bypass cache so they're always fresh; listing uses 5-min cache
  const revalidate = filter.q ? false : 300
  const res = await serverFetch(`/api/recipes${qs ? `?${qs}` : ''}`, revalidate)
  if (!res.ok) throw new Error(`getRecipes: ${res.status}`)
  return res.json()
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  // Individual recipes cache for 1 hour (ISR handles invalidation)
  const res = await serverFetch(`/api/recipes/${slug}`, 3600)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`getRecipe: ${res.status}`)
  return res.json()
}

// ─── Auth / admin (no cache) ─────────────────────────────

export async function getMe(): Promise<User | null> {
  try {
    const res = await serverFetch('/api/auth/me', false)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getAdminUsers(): Promise<User[]> {
  const res = await serverFetch('/api/admin/users', false)
  if (!res.ok) throw new Error(`getAdminUsers: ${res.status}`)
  return res.json()
}
