import { notFound } from 'next/navigation'
import { getCategories, getRecipeAuthed } from '@/lib/api.server'
import { EditClient } from './edit-client'

export const unstable_instant = false

export default async function BearbeitenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [categories, recipe] = await Promise.all([getCategories(), getRecipeAuthed(slug)])
  if (!recipe) return notFound()
  return <EditClient categories={categories} recipe={recipe} />
}
