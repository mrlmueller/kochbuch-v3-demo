export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {children}
    </div>
  )
}
