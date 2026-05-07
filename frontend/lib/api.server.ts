import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import type { Category, RecipeListItem, Recipe, RecipeFilter, User } from './api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const INTERNAL_TOKEN = process.env.INTERNAL_SSR_TOKEN ?? ''

// ─── Transport helpers ────────────────────────────────────────────────────────

// Session-authenticated fetch — only for user-specific endpoints (me, admin).
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

// Internal-token fetch — safe inside unstable_cache (no dynamic APIs).
// Uses a shared secret so the backend accepts requests without a user session.
async function backendFetchInternal(path: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
  })
}

// ─── Global cross-request cache ───────────────────────────────────────────────
//
// All recipe/category data is identical for every user, so these caches use a
// single global key (no session). revalidate:false means entries live forever;
// revalidateTag() in the proxy route invalidates them on admin writes.

const _cachedCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const res = await backendFetchInternal('/api/categories')
    if (!res.ok) return []
    return res.json()
  },
  ['categories'],
  { revalidate: false, tags: ['categories'] },
)

const _cachedRecipes = unstable_cache(
  async (category: string): Promise<RecipeListItem[]> => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    const res = await backendFetchInternal(`/api/recipes${qs}`)
    if (!res.ok) return []
    return res.json()
  },
  ['recipes'],
  { revalidate: false, tags: ['recipes'] },
)

// Per-slug factory: each slug gets its own unstable_cache entry with a
// dedicated tag so updates/deletes can invalidate exactly one recipe.
function _makeCachedRecipe(slug: string) {
  return unstable_cache(
    async (): Promise<Recipe | null> => {
      const res = await backendFetchInternal(`/api/recipes/${slug}`)
      if (res.status === 404) return null
      if (!res.ok) return null
      return res.json()
    },
    ['recipe', slug],
    { revalidate: false, tags: ['recipes', `recipe-${slug}`] },
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────
//
// React.cache() deduplicates calls within a single server render so two
// components calling getCategories() share one cache lookup per request.
//
// Pages MUST call requireAuth() before these functions — the data functions
// themselves no longer validate the session.

export async function requireAuth(): Promise<void> {
  await getSession()
}

export const getCategories = cache(async (): Promise<Category[]> => {
  return _cachedCategories()
})

export const getRecipes = cache(async (filter: RecipeFilter = {}): Promise<RecipeListItem[]> => {
  if (filter.q) {
    // Search: not cached — too many unique permutations.
    const qs = new URLSearchParams()
    qs.set('q', filter.q)
    if (filter.category) qs.set('category', filter.category)
    const res = await backendFetchInternal(`/api/recipes?${qs}`)
    if (!res.ok) return []
    return res.json()
  }
  return _cachedRecipes(filter.category ?? '')
})

export const getRecipe = cache(async (slug: string): Promise<Recipe | null> => {
  return _makeCachedRecipe(slug)()
})

// ─── Auth / admin — never cached ─────────────────────────────────────────────

export async function getMe(): Promise<User | null> {
  try {
    const session = await getSession()
    const res = await backendFetch('/api/auth/me', session)
    if (!res.ok) return null
    return res.json()
  } catch {
    // getSession() throws a redirect when the cookie is absent;
    // return null so callers receive a graceful result.
    return null
  }
}

export async function getAdminUsers(): Promise<User[]> {
  const session = await getSession()
  const res = await backendFetch('/api/admin/users', session)
  if (!res.ok) throw new Error(`getAdminUsers: ${res.status}`)
  return res.json()
}
