import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMe } from '@/lib/api.server'
import { AdminBackupButton } from '@/components/admin/backup-button'

export const unstable_instant = false

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getMe()
  if (!user || user.role !== 'admin') redirect('/')

  return (
    <div className="admin-shell">
      {/* Desktop sidebar */}
      <aside className="admin-sidebar">
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
          <AdminBackupButton />
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#7A6B5A', textDecoration: 'none', fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Zur App
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="admin-topbar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(120,90,60,0.16)' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: '#7A6B5A', marginBottom: 1 }}>Kochbuch</p>
            <p style={{ fontSize: 18, fontFamily: "'DM Serif Display', Georgia, serif", color: '#2A1F14', letterSpacing: -0.3, lineHeight: 1 }}>Admin</p>
          </div>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, color: '#7A6B5A', textDecoration: 'none', border: '1px solid rgba(120,90,60,0.16)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            App
          </Link>
        </div>
        <nav style={{ display: 'flex', overflowX: 'auto', gap: 4, padding: '10px 12px', borderBottom: '1px solid rgba(120,90,60,0.16)', background: '#FBF7F1' }}>
          <MobileNavLink href="/admin" label="Rezepte" />
          <MobileNavLink href="/admin/users" label="Benutzer" />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <AdminBackupButton />
          </div>
        </nav>
      </header>

      <main className="admin-main">
        {children}
      </main>

      <style>{`
        .admin-shell {
          display: flex;
          min-height: 100vh;
          background: #FAF6EF;
          font-family: 'Manrope', system-ui, sans-serif;
        }
        .admin-sidebar {
          width: 240px;
          flex-shrink: 0;
          background: #fff;
          border-right: 1px solid rgba(120,90,60,0.16);
          padding: 28px 18px;
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
          height: 100vh;
        }
        .admin-topbar { display: none; }
        .admin-main {
          flex: 1;
          padding: 28px 36px 60px;
          min-width: 0;
        }
        @media (max-width: 768px) {
          .admin-shell { flex-direction: column; }
          .admin-sidebar { display: none; }
          .admin-topbar {
            display: block;
            background: #fff;
            position: sticky;
            top: 0;
            z-index: 20;
          }
          .admin-main {
            padding: 16px 14px 80px;
          }
        }
      `}</style>
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

function MobileNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={{
      padding: '8px 14px', borderRadius: 999,
      fontSize: 13, fontWeight: 600, color: '#2A1F14',
      textDecoration: 'none', whiteSpace: 'nowrap',
      border: '1px solid rgba(120,90,60,0.16)', background: 'white',
    }}>
      {label}
    </Link>
  )
}
