'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  {
    href: '/',
    label: 'Entdecken',
    icon: (active: boolean) => (
      <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <path d="M9 22V12h6v10"/>
      </svg>
    ),
  },
  {
    href: '/rezepte',
    label: 'Rezepte',
    icon: (active: boolean) => (
      <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z"/>
        <path d="M4 19.5A2.5 2.5 0 016.5 22H20"/>
      </svg>
    ),
  },
  {
    href: '/neu',
    label: 'Neu',
    icon: (active: boolean) => (
      <svg width={28} height={28} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v10M7 12h10" stroke={active ? '#fff' : 'currentColor'} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  {
    href: '/suche',
    label: 'Suchen',
    icon: (_active: boolean) => (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
    ),
  },
]

export function TabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex justify-around items-center"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 12px)',
        paddingTop: 8,
        paddingLeft: 12,
        paddingRight: 12,
        background: 'var(--tab-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '0.5px solid var(--border)',
      }}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href ||
          (tab.href !== '/' && pathname.startsWith(tab.href))
        const isPrimary = tab.href === '/neu'
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center gap-1 px-4 py-1.5 no-underline"
            style={{ color: isPrimary ? 'var(--accent)' : (active ? 'var(--accent)' : 'var(--muted)') }}
          >
            {tab.icon(active)}
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.1 }}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
