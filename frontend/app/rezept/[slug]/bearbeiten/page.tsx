import { notFound } from 'next/navigation'
import { getCategories, getRecipe } from '@/lib/api.server'
import { EditClient } from './edit-client'

export default async function BearbeitenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [categories, recipe] = await Promise.all([getCategories(), getRecipe(slug)])
  if (!recipe) return notFound()
  return <EditClient categories={categories} recipe={recipe} />
}
