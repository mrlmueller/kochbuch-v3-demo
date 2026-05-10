import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cacheTag, cacheLife } from 'next/cache'
import type { Category, RecipeListItem, Recipe, User } from './api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const INTERNAL_TOKEN = process.env.INTERNAL_SSR_TOKEN ?? ''

// ─── Transport ────────────────────────────────────────────────

async function getSession(): Promise<string> {
  const session = (await cookies()).get('session')
  if (!session) redirect('/login')
  return session.value
}

async function backendFetch(path: string, session: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Cookie: `session=${session}` },
  })
}

async function backendFetchInternal(path: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
  })
}

// ─── Public reads (cached, global) ────────────────────────────
//
// Same data for every authenticated user. proxy.ts gates the route at the
// edge; these calls use the internal SSR token. Tags match the
// revalidateTag() calls in app/api/proxy/[...path]/route.ts (recipes,
// recipe-<slug>) so admin writes bust entries immediately. Categories has
// no mutation path through the app today; the tag is reserved for the day
// admin category CRUD is added. cacheLife('weeks') is just an upper bound.
//
// The cached inner functions throw on backend errors so the failure is NOT
// stored as a cache entry — a transient hiccup would otherwise poison the
// entry for weeks. The exported wrappers catch and return graceful fallbacks
// outside the cache boundary.

async function _getCategoriesCached(): Promise<Category[]> {
  'use cache'
  cacheTag('categories')
  cacheLife('weeks')
  const res = await backendFetchInternal('/api/categories')
  if (!res.ok) throw new Error(`categories: ${res.status}`)
  return res.json()
}

export async function getCategories(): Promise<Category[]> {
  try {
    return await _getCategoriesCached()
  } catch {
    return []
  }
}

async function _getRecipesCached(category: string): Promise<RecipeListItem[]> {
  'use cache'
  cacheTag('recipes')
  cacheLife('weeks')
  const qs = category ? `?category=${encodeURIComponent(category)}` : ''
  const res = await backendFetchInternal(`/api/recipes${qs}`)
  if (!res.ok) throw new Error(`recipes: ${res.status}`)
  const data = await res.json()
  // Backend wraps in {items, meta}; old shape was a plain array. Tolerate both.
  return Array.isArray(data) ? data : (data.items ?? [])
}

export async function getRecipes(category: string = ''): Promise<RecipeListItem[]> {
  try {
    return await _getRecipesCached(category)
  } catch {
    return []
  }
}

async function _getRecipeCached(slug: string): Promise<Recipe | null> {
  'use cache'
  cacheTag('recipes', `recipe-${slug}`)
  cacheLife('weeks')
  const res = await backendFetchInternal(`/api/recipes/${slug}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`recipe ${slug}: ${res.status}`)
  return res.json()
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  try {
    return await _getRecipeCached(slug)
  } catch {
    return null
  }
}

// ─── Auth / admin — never cached ──────────────────────────────

export async function getAdminCategories(): Promise<Category[]> {
  const session = await getSession()
  const res = await backendFetch('/api/categories', session)
  if (!res.ok) return []
  return res.json()
}

export async function getMe(): Promise<User | null> {
  try {
    const session = await getSession()
    const res = await backendFetch('/api/auth/me', session)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getAdminUsers(): Promise<User[]> {
  const session = await getSession()
  const res = await backendFetch('/api/admin/users', session)
  if (!res.ok) throw new Error(`getAdminUsers: ${res.status}`)
  return res.json()
}

export async function getAdminRecipes(filter?: 'all' | 'global' | 'user'): Promise<RecipeListItem[]> {
  const session = await getSession()
  const qs = filter && filter !== 'all' ? `?filter=${filter}` : ''
  const res = await backendFetch(`/api/admin/recipes${qs}`, session)
  if (!res.ok) return []
  return res.json()
}
