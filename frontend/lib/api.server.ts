import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import type { Category, RecipeListItem, Recipe, RecipeFilter, User } from './api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// Read session cookie; redirect to /login if absent.
async function getSession(): Promise<string> {
  const session = (await cookies()).get('session')
  if (!session) redirect('/login')
  return session.value
}

// Plain fetch — no dynamic APIs, safe inside unstable_cache.
async function backendFetch(path: string, session: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Cookie: `session=${session}` },
  })
}

// ─── Cross-request cache (survives across SSR requests) ──────────────────────
//
// unstable_cache stores responses in Next.js data cache keyed by
// [keyParts, JSON.stringify(args)]. Each session token produces its own
// entries — per-user isolation with a shared TTL per data type.

const _cachedCategories = unstable_cache(
  async (session: string): Promise<Category[]> => {
    const res = await backendFetch('/api/categories', session)
    if (!res.ok) return []
    return res.json()
  },
  ['categories'],
  { revalidate: 3600 }, // categories change rarely — 1 hour TTL
)

const _cachedRecipes = unstable_cache(
  async (session: string, category: string): Promise<RecipeListItem[]> => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    const res = await backendFetch(`/api/recipes${qs}`, session)
    if (!res.ok) return []
    return res.json()
  },
  ['recipes'],
  { revalidate: 300 }, // recipe list — 5 min TTL
)

const _cachedRecipe = unstable_cache(
  async (session: string, slug: string): Promise<Recipe | null> => {
    const res = await backendFetch(`/api/recipes/${slug}`, session)
    if (res.status === 404) return null
    if (!res.ok) return null
    return res.json()
  },
  ['recipe'],
  { revalidate: 300 }, // recipe detail — 5 min TTL
)

// ─── Public API ───────────────────────────────────────────────────────────────
//
// React.cache() deduplicates calls with the same arguments within a single
// server render — if two components call getCategories(), only one network
// round-trip (or cache lookup) happens.

export const getCategories = cache(async (): Promise<Category[]> => {
  return _cachedCategories(await getSession())
})

export const getRecipes = cache(async (filter: RecipeFilter = {}): Promise<RecipeListItem[]> => {
  const session = await getSession()
  if (filter.q) {
    // Search queries are not cached — too many unique permutations.
    const qs = new URLSearchParams()
    qs.set('q', filter.q)
    if (filter.category) qs.set('category', filter.category)
    const res = await backendFetch(`/api/recipes?${qs}`, session)
    if (!res.ok) return []
    return res.json()
  }
  return _cachedRecipes(session, filter.category ?? '')
})

export const getRecipe = cache(async (slug: string): Promise<Recipe | null> => {
  return _cachedRecipe(await getSession(), slug)
})

// ─── Auth / admin — never cached ─────────────────────────────────────────────

export async function getMe(): Promise<User | null> {
  try {
    const session = await getSession()
    const res = await backendFetch('/api/auth/me', session)
    if (!res.ok) return null
    return res.json()
  } catch {
    // getSession() throws a redirect error when the cookie is absent;
    // catch it here so callers receive null instead of an uncaught redirect.
    return null
  }
}

export async function getAdminUsers(): Promise<User[]> {
  const session = await getSession()
  const res = await backendFetch('/api/admin/users', session)
  if (!res.ok) throw new Error(`getAdminUsers: ${res.status}`)
  return res.json()
}
