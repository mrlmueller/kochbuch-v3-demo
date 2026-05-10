'use client'

import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/components/recipe-form'
import type { Category, Recipe } from '@/lib/api'

export function EditClient({ categories, recipe }: { categories: Category[]; recipe: Recipe }) {
  const router = useRouter()
  return (
    <main style={{ padding: '24px 16px 96px' }}>
      <RecipeForm
        categories={categories}
        initial={recipe}
        mode="edit"
        isAdmin={false}
        onAfterSave={(slug) => router.push(`/rezept/${slug}`)}
      />
    </main>
  )
}
