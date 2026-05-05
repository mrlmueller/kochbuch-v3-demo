import Link from 'next/link'
import { getRecipes, getCategories } from '@/lib/api'

export const revalidate = 60

export default async function AdminPage() {
  const [recipes, categories] = await Promise.all([getRecipes(), getCategories()])
  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c.name]))

  return (
    <div className="px-5 pt-16 pb-10">
      <div className="flex items-center justify-between mb-6">
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
          Admin
        </h1>
        <Link href="/admin/neu"
          className="px-4 py-2 rounded-xl text-sm font-semibold no-underline"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          + Neu
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {recipes.map((r) => (
          <div key={r.slug} className="flex items-center gap-3 p-3 rounded-2xl"
            style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate" style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
                {r.title}
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                {catMap[r.category_slug] ?? r.category_slug} · {r.time_minutes} min
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Link href={`/admin/${r.slug}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold no-underline"
                style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                Bearbeiten
              </Link>
              <Link href={`/rezept/${r.slug}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold no-underline"
                style={{ background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                Ansehen
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
