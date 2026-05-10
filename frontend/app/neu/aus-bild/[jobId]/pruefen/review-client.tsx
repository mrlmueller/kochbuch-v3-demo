'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/components/recipe-form'
import { clientGetAIJob, clientConsumeAIJob, type AIJob, type Category, type Recipe } from '@/lib/api'

export function ReviewClient({ jobId, categories }: { jobId: string; categories: Category[] }) {
  const router = useRouter()
  const [job, setJob] = useState<AIJob | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    clientGetAIJob(jobId).then(setJob).catch(e => setError(e.message))
  }, [jobId])

  if (error) return <main style={{ padding: 24 }}><p style={{ color: '#B91C1C' }}>{error}</p></main>
  if (!job) return <main style={{ padding: 24 }}><p>Lädt…</p></main>
  if (job.status !== 'ready' || !job.recipe_json) {
    return (
      <main style={{ padding: 24 }}>
        <p>Dieser Job ist noch nicht bereit (Status: {job.status}).</p>
      </main>
    )
  }

  const initial: Partial<Recipe> = {
    ...job.recipe_json,
    image_url: job.recipe_json.image_url || job.image_urls[0],
  }

  return (
    <main style={{ padding: '24px 16px 96px' }}>
      <RecipeForm
        categories={categories}
        initial={initial}
        mode="review-ai"
        isAdmin={false}
        imageOptions={job.image_urls}
        onAfterSave={async (slug) => {
          try { await clientConsumeAIJob(jobId) } catch {}
          router.push(`/rezept/${slug}`)
        }}
      />
    </main>
  )
}
