import { getCategories } from '@/lib/api.server'
import { ManuellClient } from './manuell-client'

export default async function NeuManuellPage() {
  const categories = await getCategories()
  return <ManuellClient categories={categories} />
}
