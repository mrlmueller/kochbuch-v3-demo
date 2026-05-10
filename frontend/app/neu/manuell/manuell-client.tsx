'use client'

import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/components/recipe-form'
import type { Category } from '@/lib/api'

export function ManuellClient({ categories }: { categories: Category[] }) {
  const router = useRouter()
  return (
    <main style={{ padding: '24px 16px 96px' }}>
      <RecipeForm
        categories={categories}
        mode="create"
        isAdmin={false}
        onAfterSave={(slug) => router.push(`/rezept/${slug}`)}
      />
    </main>
  )
}
