import { KostenClient } from './kosten-client'

// Auth-gated, real-time data — skip prerender.
export const unstable_instant = false

export default function KostenPage() {
  return <KostenClient />
}
