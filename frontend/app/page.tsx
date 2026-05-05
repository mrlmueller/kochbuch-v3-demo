import { Suspense } from 'react'
import Link from 'next/link'
import { getCategories, getRecipes } from '@/lib/api'
import { CategoryGrid } from '@/components/category-grid'
import { CardCompact, CardList } from '@/components/recipe-card'
import { BlurImage } from '@/components/blur-image'
import { HomeSkeleton } from '@/components/skeleton'
import { PersistLastRecipe } from '@/components/persist-last-recipe'

export const revalidate = 60

async function HomeContent() {
  const [categories, allRecipes] = await Promise.all([
    getCategories(),
    getRecipes(),
  ])

  const featured = allRecipes[0]
  const quick = allRecipes.filter((r) => r.time_minutes > 0 && r.time_minutes <= 20)
  const hearty = allRecipes.filter((r) => r.category_slug === 'hauptgerichte').slice(0, 5)
  const sweet = allRecipes.filter(
    (r) => r.category_slug === 'backen-und-suesses' || r.category_slug === 'snacks'
  ).slice(0, 10)

  const recipeCounts = categories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.slug] = allRecipes.filter((r) => r.category_slug === cat.slug).length
    return acc
  }, {})

  return (
    <div className="pb-6">
      {featured && <PersistLastRecipe slug={featured.slug} />}
      {/* Header */}
      <div className="px-5 pt-16 pb-6">
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>
          Entdecken
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', lineHeight: 1.05, fontFamily: 'var(--font-serif)', letterSpacing: -0.5 }}>
          Was inspiriert<br />dich heute?
        </h1>
      </div>

      {/* Featured hero */}
      {featured && (
        <div className="px-5 mb-8">
          <Link href={`/rezept/${featured.slug}`} className="no-underline relative block rounded-[24px] overflow-hidden" style={{ aspectRatio: '4/5', boxShadow: 'var(--card-shadow)' }}>
            {featured.image_url ? (
              <BlurImage src={featured.image_url} alt={featured.title} fill className="object-cover" sizes="calc(100vw - 40px)" priority blurhash={featured.image_blurhash} />
            ) : (
              <div className="absolute inset-0" style={{ background: 'var(--border)' }} />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, transparent 50%)' }} />
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', color: 'var(--accent)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Rezept des Tages
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <h2 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, fontFamily: 'var(--font-serif)', marginBottom: 8 }}>
                {featured.title}
              </h2>
              <p style={{ fontSize: 13, opacity: 0.9 }}>
                {featured.time_minutes > 0 ? `${featured.time_minutes} min` : ''}
                {featured.servings ? `${featured.time_minutes > 0 ? ' · ' : ''}${featured.servings}` : ''}
              </p>
            </div>
          </Link>
        </div>
      )}

      {/* Schnell gemacht carousel */}
      {quick.length > 0 && (
        <div className="mb-8">
          <div className="flex justify-between items-baseline px-5 mb-3">
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3, lineHeight: 1.1 }}>
                Schnell gemacht
              </h2>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Unter 20 Minuten</p>
            </div>
          </div>
          <div className="scroll-snap-x flex gap-3 px-5">
            {quick.map((r) => <CardCompact key={r.slug} recipe={r} />)}
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="px-5 mb-8">
        <h2 className="mb-4" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3 }}>
          Nach Kategorie
        </h2>
        <CategoryGrid categories={categories} recipeCounts={recipeCounts} />
      </div>

      {/* Herzhaft list */}
      {hearty.length > 0 && (
        <div className="px-5 mb-8">
          <h2 className="mb-4" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3 }}>
            Herzhaft & sättigend
          </h2>
          <div className="flex flex-col gap-3">
            {hearty.map((r) => <CardList key={r.slug} recipe={r} />)}
          </div>
        </div>
      )}

      {/* Süßes carousel */}
      {sweet.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-4 px-5" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3 }}>
            Süßes & Snacks
          </h2>
          <div className="scroll-snap-x flex gap-3 px-5">
            {sweet.map((r) => <CardCompact key={r.slug} recipe={r} />)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function EntdeckenPage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  )
}
