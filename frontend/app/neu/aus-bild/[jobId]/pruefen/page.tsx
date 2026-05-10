import { getCategories } from '@/lib/api.server'
import { ReviewClient } from './review-client'

export const unstable_instant = false

export default async function PruefenPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const categories = await getCategories()
  return <ReviewClient jobId={jobId} categories={categories} />
}
