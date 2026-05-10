import { getCategories } from '@/lib/api.server'
import { ManuellClient } from './manuell-client'

// Auth-gated, per-user page — no benefit to prerender, and the build
// would otherwise need the backend reachable to fetch categories.
export const unstable_instant = false

export default async function NeuManuellPage() {
  const categories = await getCategories()
  return <ManuellClient categories={categories} />
}
