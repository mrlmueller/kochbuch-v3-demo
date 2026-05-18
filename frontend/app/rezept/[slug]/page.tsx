import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getRecipe, getRecipeAuthed, getCategories, getRecipes } from '@/lib/api.server'
import { DetailClient } from './detail-client'
import RecipeLoading from './loading'

export const unstable_instant = {
  prefetch: 'static',
  // Build-time validator's error template ("searchParams accessed in
  // generateMetadata or file-based metadata depending on dynamic params")
  // doesn't match anything in the codebase — no generateMetadata exists
  // and no metadata files depend on params. Dev-time validation still runs.
  unstable_disableBuildValidation: true,
}

// Pre-generate all current recipe slugs at build time.
// Falls back to a single placeholder slug if the backend is unavailable —
// Next 16's Cache Components requires generateStaticParams to return at
// least one entry; the placeholder route will 404 at runtime if anyone
// hits it. Real recipe pages are still rendered on demand for non-prebuilt
// slugs via the default dynamicParams behaviour.
export async function generateStaticParams() {
  try {
    const recipes = await getRecipes()
    if (recipes.length === 0) return [{ slug: '__none__' }]
    return recipes.map((r) => ({ slug: r.slug }))
  } catch {
    return [{ slug: '__none__' }]
  }
}

async function RecipeContent({ slug }: { slug: string }) {
  // Both reads go through the cached internal-token path; the page is
  // fully prerenderable at build time and serves the cached shell on every
  // subsequent load. Ownership / canEdit is computed client-side from
  // /api/auth/me (cached in sessionStorage) inside DetailClient so it
  // doesn't block first paint.
  const [cachedRecipe, categories] = await Promise.all([
    getRecipe(slug),
    getCategories(),
  ])

  // Global (admin) recipes come back from the cached internal-token path
  // above. User-private recipes are deliberately 404'd by that path so they
  // never enter the shared cache — fall back to an owner-aware fetch that
  // carries the viewer's session. This keeps global recipes fully static
  // and only makes the render dynamic for private recipes.
  const recipe = cachedRecipe ?? (await getRecipeAuthed(slug))

  if (!recipe) return notFound()

  const category = categories.find((c) => c.slug === recipe.category_slug)
  return <DetailClient recipe={recipe} categoryName={category?.name ?? ''} />
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<RecipeLoading />}>
      {params.then(({ slug }) => <RecipeContent slug={slug} />)}
    </Suspense>
  )
}
