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
  ingredient_names?: string
  owner_id?: string | null
  owner_email?: string
  created_by?: string | null
  is_mine?: boolean
}
export interface Macros {
  kcal: number; protein_g: number; fat_g: number
  carbs_g: number; sugar_g: number; fibre_g: number
}
export interface PublicNutrition { per_serving: Macros; outdated?: boolean }

export interface Recipe extends RecipeListItem {
  ingredients: Ingredient[]; steps: string[]
  notes: string; created_at: string; updated_at: string
  nutrition?: PublicNutrition | null
}
export interface RecipeFilter { category?: string; q?: string; owner?: 'me' }
export interface ListRecipesResponse {
  items: RecipeListItem[]
  meta: { my_recipe_count: number }
}
export interface User {
  id: string; email: string; role: 'admin' | 'user'
  status: 'active' | 'deactivated'
  created_at: string; last_login?: string; last_active_at?: string
}

// ─── AI jobs ─────────────────────────────────────────────

export type AIJobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled' | 'consumed'

export interface AIJob {
  id: string
  status: AIJobStatus
  provider: string
  model: string
  image_urls: string[]
  recipe_json?: Partial<Recipe>
  error?: string
  attempts: number
  created_at: string
  started_at?: string
  finished_at?: string
}

export interface ListAIJobsResponse {
  items: AIJob[]
  daily_used: number
  daily_limit: number
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
  const res = await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' })
  await throwIfError(res)
  const sessionRes = await fetch('/api/session', { method: 'DELETE' })
  await throwIfError(sessionRes)
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
  const res = await fetch(`/api/proxy/admin/users/${id}`, { method: 'DELETE' })
  await throwIfError(res)
}

export interface UserDetail {
  user: User
  recipe_count: number
  recipes: RecipeListItem[]
  ai_used_today: number
  ai_daily_limit: number
}

export async function clientGetUserDetail(id: string): Promise<UserDetail> {
  const res = await fetch(`/api/proxy/admin/users/${id}`)
  await throwIfError(res)
  return res.json()
}

// Sets the user's AI-job cap for the current day only.
export async function clientSetUserAILimit(id: string, limit: number): Promise<{ ai_daily_limit: number }> {
  const res = await fetch(`/api/proxy/admin/users/${id}/ai-limit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  })
  await throwIfError(res)
  return res.json()
}

// Returns the final slug (server may have suffixed it -2, -3, …).
export async function clientSaveRecipe(recipe: Partial<Recipe>, isNew: boolean): Promise<{ slug: string }> {
  const url = isNew ? '/api/proxy/recipes' : `/api/proxy/recipes/${recipe.slug}`
  const res = await fetch(url, {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  })
  await throwIfError(res)
  if (!isNew) return { slug: recipe.slug! }
  return res.json()
}

export async function clientDeleteRecipe(slug: string): Promise<void> {
  const res = await fetch(`/api/proxy/recipes/${slug}`, { method: 'DELETE' })
  await throwIfError(res)
}

// ─── Admin-only: recipe calibration status ──────────────────
// These hit admin-gated endpoints and are never called for normal users.
// The status is deliberately kept out of the public recipe payloads so the
// shared static cache and the non-admin experience stay identical.

export async function clientGetRecipeConfirmations(): Promise<string[]> {
  // no-store: this is live admin status; it must never be served from the
  // browser/route cache (otherwise toggles look stale until a restart).
  const res = await fetch('/api/proxy/admin/recipes/status', { cache: 'no-store' })
  await throwIfError(res)
  const data = (await res.json()) as { confirmed?: string[] }
  return data.confirmed ?? []
}

export async function clientSetRecipeConfirmed(slug: string, confirmed: boolean): Promise<void> {
  const res = await fetch(`/api/proxy/admin/recipes/${slug}/confirm`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed }),
  })
  await throwIfError(res)
}

export async function clientGetRecipes(filter: RecipeFilter = {}): Promise<ListRecipesResponse> {
  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)
  if (filter.owner) params.set('owner', filter.owner)
  const qs = params.toString()
  const res = await fetch(`/api/proxy/recipes${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`getRecipes: ${res.status}`)
  const data = await res.json()
  // Tolerate either the wrapped or legacy plain-array shape.
  if (Array.isArray(data)) return { items: data, meta: { my_recipe_count: 0 } }
  return data
}

// ─── Admin AI stats ──────────────────────────────────────

export interface AIStatsBucket {
  jobs: number
  success_jobs: number
  failed_jobs: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

export interface AIStatsByModel {
  provider: string
  model: string
  jobs: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

export interface AIStatsByUser {
  user_id: string
  email: string
  jobs: number
  cost_usd: number
  last_used_at?: string
}

export interface AIStatsRecentItem {
  job_id: string
  user_email: string
  provider: string
  model: string
  status: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  created_at: string
}

export interface AIStats {
  generated_at: string
  totals: AIStatsBucket
  last_7d: AIStatsBucket
  last_30d: AIStatsBucket
  by_model: AIStatsByModel[]
  by_user: AIStatsByUser[]
  recent: AIStatsRecentItem[]
}

export async function clientGetAIStats(): Promise<AIStats> {
  const res = await fetch('/api/proxy/admin/ai-stats')
  await throwIfError(res)
  return res.json()
}

export interface BackupResult {
  filename: string
  recipe_count: number
  category_count: number
  bytes: number
}

export async function clientTriggerBackup(): Promise<BackupResult> {
  const res = await fetch('/api/proxy/admin/backup', { method: 'POST' })
  await throwIfError(res)
  return res.json()
}

// ─── AI jobs ─────────────────────────────────────────────

export async function clientCreateAIJob(input: {
  image_urls: string[]
  provider?: string
  model?: string
}): Promise<{ id: string; daily_used: number; daily_limit: number }> {
  const res = await fetch('/api/proxy/ai-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  await throwIfError(res)
  return res.json()
}

export async function clientListAIJobs(): Promise<ListAIJobsResponse> {
  const res = await fetch('/api/proxy/ai-jobs')
  await throwIfError(res)
  return res.json()
}

export async function clientGetAIJob(id: string): Promise<AIJob> {
  const res = await fetch(`/api/proxy/ai-jobs/${id}`)
  await throwIfError(res)
  return res.json()
}

export async function clientDeleteAIJob(id: string): Promise<void> {
  const res = await fetch(`/api/proxy/ai-jobs/${id}`, { method: 'DELETE' })
  await throwIfError(res)
}

export async function clientConsumeAIJob(id: string): Promise<void> {
  const res = await fetch(`/api/proxy/ai-jobs/${id}/consume`, { method: 'POST' })
  await throwIfError(res)
}

// ─── Image search (Google CSE proxy) ───────────────────────

export interface ImageSearchResult {
  url: string
  thumb: string
  title: string
  width: number
  height: number
  source_url: string
}

export async function clientImageSearch(q: string): Promise<ImageSearchResult[]> {
  const res = await fetch(`/api/proxy/image-search?q=${encodeURIComponent(q)}`)
  await throwIfError(res)
  const data = await res.json() as { items: ImageSearchResult[] }
  return data.items ?? []
}

// ─── Admin: per-recipe nutrition control ─────────────────

export interface NutritionDetail {
  status?: 'none'
  per_recipe?: Macros
  per_serving?: Macros
  cost_usd?: number
  outdated?: boolean
  computed_at?: string
}

export async function clientComputeNutrition(slug: string): Promise<void> {
  const res = await fetch(`/api/proxy/admin/recipes/${slug}/nutrition`, { method: 'POST' })
  if (!res.ok) throw new Error((await res.json().catch(() => ({} as { error?: string }))).error ?? 'Fehler')
}

export async function clientGetNutritionDetail(slug: string): Promise<NutritionDetail> {
  const res = await fetch(`/api/proxy/admin/recipes/${slug}/nutrition`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Fehler')
  return res.json()
}

export async function clientGetNutritionStatuses(): Promise<Record<string, 'current' | 'outdated'>> {
  const res = await fetch('/api/proxy/admin/recipes/status', { cache: 'no-store' })
  if (!res.ok) return {}
  const data = await res.json()
  return data.nutrition ?? {}
}
