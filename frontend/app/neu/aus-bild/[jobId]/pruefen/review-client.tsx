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

  // A consumed job already produced a recipe; a cancelled one was discarded.
  // Either way this review page is a dead end (e.g. reached via the browser
  // back button after saving) — send the user back to the New-recipe hub.
  useEffect(() => {
    if (job && (job.status === 'consumed' || job.status === 'cancelled')) {
      router.replace('/neu')
    }
  }, [job, router])

  if (error) return <main style={{ padding: 24 }}><p style={{ color: '#B91C1C' }}>{error}</p></main>
  if (!job) return <main style={{ padding: 24 }}><p>Lädt…</p></main>
  if (job.status === 'consumed' || job.status === 'cancelled') {
    return <main style={{ padding: 24 }}><p>Dieses Rezept wurde bereits gespeichert. Du wirst weitergeleitet…</p></main>
  }
  if (job.status !== 'ready' || !job.recipe_json) {
    return (
      <main style={{ padding: 24 }}>
        <p>Dieser Job ist noch nicht bereit (Status: {job.status}).</p>
      </main>
    )
  }

  // The uploaded photos are usually pictures of printed text, not the
  // finished dish — so the cover image starts empty. The user picks a
  // proper image via "Bild suchen" or their own upload; the source
  // photos stay available in the picker if one happens to show the dish.
  const initial: Partial<Recipe> = {
    ...job.recipe_json,
    image_url: job.recipe_json.image_url ?? '',
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
