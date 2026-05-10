import { getMe } from '@/lib/api.server'
import { AusBildClient } from './aus-bild-client'

export default async function AusBildPage() {
  const me = await getMe()
  return <AusBildClient isAdmin={me?.role === 'admin'} />
}
