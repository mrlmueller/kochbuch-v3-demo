import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import type { Category, RecipeListItem, Recipe, RecipeFilter, User } from './api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const INTERNAL_TOKEN = process.env.INTERNAL_SSR_TOKEN ?? ''

// ─── Transport helpers ────────────────────────────────────────────────────────

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

// ─── Global cross-request cache ───────────────────────────────────────────────
//
// All recipe/category data is identical for every user — one global cache entry
// serves all requests. revalidateTag() in the proxy route busts entries on
// admin writes. A finite revalidate TTL acts as a safety net so a bad entry
// (e.g. from a misconfigured deploy) can never be cached forever.
//
// Errors are thrown (not returned as []) so that unstable_cache does NOT store
// the failure. The public wrappers catch and return graceful fallbacks instead.
// Key suffix -v2 orphans any poisoned entries from earlier deploys.

const _cachedCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const res = await backendFetchInternal('/api/categories')
    if (!res.ok) throw new Error(`categories: ${res.status}`)
    return res.json()
  },
  ['categories-v2'],
  { revalidate: 3600, tags: ['categories'] },
)

const _cachedRecipes = unstable_cache(
  async (category: string): Promise<RecipeListItem[]> => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    const res = await backendFetchInternal(`/api/recipes${qs}`)
    if (!res.ok) throw new Error(`recipes: ${res.status}`)
    return res.json()
  },
  ['recipes-v2'],
  { revalidate: 300, tags: ['recipes'] },
)

function _makeCachedRecipe(slug: string) {
  return unstable_cache(
    async (): Promise<Recipe | null> => {
      const res = await backendFetchInternal(`/api/recipes/${slug}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`recipe ${slug}: ${res.status}`)
      return res.json()
    },
    ['recipe-v2', slug],
    { revalidate: 300, tags: ['recipes', `recipe-${slug}`] },
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────
//
// React.cache() deduplicates within a single render. Errors from the
// unstable_cache callbacks are caught here so pages never crash — they just
// show empty content and retry on the next request.

export async function requireAuth(): Promise<void> {
  await getSession()
}

export const getCategories = cache(async (): Promise<Category[]> => {
  try {
    return await _cachedCategories()
  } catch {
    return []
  }
})

export const getRecipes = cache(async (filter: RecipeFilter = {}): Promise<RecipeListItem[]> => {
  if (filter.q) {
    try {
      const qs = new URLSearchParams()
      qs.set('q', filter.q)
      if (filter.category) qs.set('category', filter.category)
      const res = await backendFetchInternal(`/api/recipes?${qs}`)
      if (!res.ok) return []
      return res.json()
    } catch {
      return []
    }
  }
  try {
    return await _cachedRecipes(filter.category ?? '')
  } catch {
    return []
  }
})

export const getRecipe = cache(async (slug: string): Promise<Recipe | null> => {
  try {
    return await _makeCachedRecipe(slug)()
  } catch {
    return null
  }
})

// ─── Auth / admin — never cached ─────────────────────────────────────────────

// Session-authenticated category fetch for admin pages. Bypasses the
// internal-token cache so admin forms always have valid options regardless
// of whether INTERNAL_SSR_TOKEN is configured.
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
