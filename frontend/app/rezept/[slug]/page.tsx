import { notFound } from 'next/navigation'
import { requireAuth, getRecipe, getCategories, getRecipes } from '@/lib/api.server'
import { DetailClient } from './detail-client'

// Always render dynamically — cookies() requires a request context
export const dynamic = 'force-dynamic'

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

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requireAuth()
  const { slug } = await params
  const [recipe, categories] = await Promise.all([
    getRecipe(slug),
    getCategories(),
  ])

  if (!recipe) return notFound()

  const category = categories.find((c) => c.slug === recipe.category_slug)
  return <DetailClient recipe={recipe} categoryName={category?.name ?? ''} />
}
