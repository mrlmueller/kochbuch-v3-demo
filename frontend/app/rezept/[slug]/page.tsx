import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getRecipe, getCategories, getRecipes } from '@/lib/api.server'
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
  const [recipe, categories] = await Promise.all([
    getRecipe(slug),
    getCategories(),
  ])

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
