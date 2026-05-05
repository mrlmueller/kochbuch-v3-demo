import type { Metadata } from 'next'
import './globals.css'
import { TabBar } from '@/components/tab-bar'
import { DesktopHeader } from '@/components/desktop-header'

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
    <html lang="de" suppressHydrationWarning>
      <body>
        {/* Desktop header — hidden below 1024px */}
        <div className="hidden lg:block">
          <DesktopHeader />
        </div>
        <main className="pb-24 lg:pb-0 min-h-screen" style={{ background: 'var(--bg)' }}>
          {children}
        </main>
        {/* Desktop footer */}
        <footer className="hidden lg:block" style={{ borderTop: '1px solid var(--border)', marginTop: 80, padding: '40px 40px 60px', color: 'var(--muted)', fontSize: 13 }}>
          <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text)' }}>Mein Kochbuch</div>
          </div>
        </footer>
        {/* Mobile tab bar — hidden above 1024px */}
        <div className="lg:hidden">
          <TabBar />
        </div>
      </body>
    </html>
  )
}
