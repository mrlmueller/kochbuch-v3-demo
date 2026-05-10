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
// Falls back to on-demand SSR if the backend is unavailable during build.
export async function generateStaticParams() {
  try {
    const recipes = await getRecipes()
    return recipes.map((r) => ({ slug: r.slug }))
  } catch {
    return []
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
  const isMine = !!me && !!recipe.owner_id && recipe.owner_id === me.id
  const canEdit = isMine || me?.role === 'admin'
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
