'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A' }

const ITEMS = [
  { href: '/admin', label: 'Rezepte' },
  { href: '/admin/users', label: 'Benutzer' },
  { href: '/admin/kosten', label: 'KI-Kosten' },
]

const ICONS: Record<string, React.ReactNode> = {
  '/admin': <path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z" />,
  '/admin/users': <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
  '/admin/kosten': <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
}

// /admin/neu and /admin/{slug} belong to the Rezepte section, so anything
// that isn't the Benutzer or Kosten subtree counts as the Rezepte tab.
function activeHref(pathname: string): string {
  if (pathname.startsWith('/admin/users')) return '/admin/users'
  if (pathname.startsWith('/admin/kosten')) return '/admin/kosten'
  return '/admin'
}

export function AdminNav({ variant }: { variant: 'desktop' | 'mobile' }) {
  const current = activeHref(usePathname())

  if (variant === 'mobile') {
    return (
      <>
        {ITEMS.map((item) => {
          const active = item.href === current
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              style={{
                flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 9,
                fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
                background: active ? T.accent : 'transparent',
                color: active ? '#fff' : T.muted,
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </>
    )
  }

  return (
    <>
      {ITEMS.map((item) => {
        const active = item.href === current
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 9, textDecoration: 'none',
              fontSize: 14, fontWeight: active ? 600 : 500,
              background: active ? `${T.accent}14` : 'transparent',
              color: active ? T.accent : T.text,
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[item.href]}
            </svg>
            {item.label}
          </Link>
        )
      })}
    </>
  )
}
