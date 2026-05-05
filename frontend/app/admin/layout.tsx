import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMe } from '@/lib/api'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getMe()
  if (!user || user.role !== 'admin') redirect('/')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FAF6EF', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, flexShrink: 0, background: '#fff',
        borderRight: '1px solid rgba(120,90,60,0.16)',
        padding: '28px 18px', display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ marginBottom: 28, padding: '0 6px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: '#7A6B5A', marginBottom: 4 }}>Kochbuch</p>
          <p style={{ fontSize: 22, fontFamily: "'DM Serif Display', Georgia, serif", color: '#2A1F14', letterSpacing: -0.3 }}>Admin</p>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <NavLink href="/admin" label="Rezepte" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z"/></svg>
          } />
          <NavLink href="/admin/users" label="Benutzer" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          } />
        </nav>
        <div style={{ padding: '0 6px', borderTop: '1px solid rgba(120,90,60,0.12)', paddingTop: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#7A6B5A', textDecoration: 'none', fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Zur App
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '28px 36px 60px', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px', borderRadius: 9, textDecoration: 'none',
      color: '#2A1F14', fontSize: 14, fontWeight: 500,
    }}>
      {icon}
      {label}
    </Link>
  )
}
