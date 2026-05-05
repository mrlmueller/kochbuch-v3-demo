'use client'

import { useRouter } from 'next/navigation'
import type { Category } from '@/lib/api'

interface Props {
  categories: Category[]
  recipeCounts: Record<string, number>
}

export function CategoryGrid({ categories, recipeCounts }: Props) {
  const router = useRouter()
  return (
    <div className="grid grid-cols-2 gap-3">
      {categories.map((cat) => {
        const count = recipeCounts[cat.slug] ?? 0
        return (
          <button
            key={cat.slug}
            type="button"
            onClick={() => router.push(`/rezepte?category=${cat.slug}`)}
            className="rounded-[18px] p-4 text-left cursor-pointer border-none"
            style={{
              background: `linear-gradient(135deg, ${cat.accent} 0%, ${cat.accent}dd 100%)`,
              color: '#fff',
              minHeight: 92,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <p className="font-bold" style={{ fontSize: 15, fontFamily: 'var(--font-serif)', lineHeight: 1.2 }}>
              {cat.name}
            </p>
            <p style={{ fontSize: 11, opacity: 0.85, fontWeight: 500 }}>
              {count} {count === 1 ? 'Rezept' : 'Rezepte'}
            </p>
          </button>
        )
      })}
    </div>
  )
}
