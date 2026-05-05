import type { Metadata } from 'next'
import './globals.css'
import { TabBar } from '@/components/tab-bar'

export const metadata: Metadata = {
  title: 'Kochbuch',
  description: 'Mein persönliches Kochbuch',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>
        <main className="pb-24 min-h-screen" style={{ background: 'var(--bg)' }}>
          {children}
        </main>
        <TabBar />
      </body>
    </html>
  )
}
