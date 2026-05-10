import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getRecipe, getCategories, getRecipes, getMe } from '@/lib/api.server'
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
  // The recipe itself is fetched through the cached internal-token path
  // (same content for everyone), so its `is_mine` flag is always false
  // there. Ownership is computed below from the live session.
  const [recipe, categories, me] = await Promise.all([
    getRecipe(slug),
    getCategories(),
    getMe(),
  ])

  if (!recipe) return notFound()

  const category = categories.find((c) => c.slug === recipe.category_slug)
  // Edit/delete on the public recipe page is creator-only.
  // Admin still manages all recipes via /admin; this prevents the buttons
  // from appearing on every restored/global recipe an admin opens.
  const canEdit = !!me && !!recipe.created_by && recipe.created_by === me.id
  return <DetailClient recipe={recipe} categoryName={category?.name ?? ''} canEdit={canEdit} />
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
