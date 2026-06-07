import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { DM_Serif_Display, Manrope } from 'next/font/google'
import './globals.css'
import { TabBar } from '@/components/tab-bar'
import { DesktopHeader } from '@/components/desktop-header'
import { SessionGuard } from '@/components/session-guard'
import { Logo } from '@/components/logo'

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Kochbuch',
  description: 'Mein persönliches Kochbuch',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kochbuch',
  },
}

export const viewport: Viewport = {
  themeColor: '#FAF6EF',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de" suppressHydrationWarning className={`${dmSerifDisplay.variable} ${manrope.variable}`}>
      <body>
        {/* Logs out a window whose session was invalidated by a newer login
            elsewhere. Suspense: it reads usePathname(). */}
        <Suspense fallback={null}>
          <SessionGuard />
        </Suspense>
        {/* Desktop header — hidden below 1024px. Suspense lets Next 16's
            Cache Components prerender the static shell of dynamic pages
            without waiting on usePathname() inside the header. */}
        <div className="hidden lg:block">
          <Suspense fallback={null}>
            <DesktopHeader />
          </Suspense>
        </div>
        <main className="pb-24 lg:pb-0 min-h-screen" style={{ background: 'var(--bg)' }}>
          {children}
        </main>
        {/* Desktop footer */}
        <footer className="hidden lg:block" style={{ borderTop: '1px solid var(--border)', marginTop: 80, padding: '40px 40px 60px', color: 'var(--muted)', fontSize: 13 }}>
          <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text)' }}>
              <Logo size={22} />
              Mein Kochbuch
            </div>
          </div>
        </footer>
        {/* Mobile tab bar — hidden above 1024px. Wrapped in Suspense for
            the same reason as DesktopHeader above. */}
        <div className="lg:hidden">
          <Suspense fallback={null}>
            <TabBar />
          </Suspense>
        </div>
      </body>
    </html>
  )
}
