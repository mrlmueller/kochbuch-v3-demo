import Link from 'next/link'
import { getCategories, getRecipes } from '@/lib/api.server'
import { CardCompact, CardList } from '@/components/recipe-card'
import { BlurImage } from '@/components/blur-image'
import { PersistLastRecipe } from '@/components/persist-last-recipe'
import { dailyPick, dailyShuffle, getTodayKey } from '@/lib/daily-shuffle'
import type { Category, RecipeListItem } from '@/lib/api'

export const unstable_instant = {
  prefetch: 'static',
  // Build-time validator's error template ("searchParams accessed in
  // generateMetadata or file-based metadata depending on dynamic params")
  // doesn't match anything in the codebase — no generateMetadata exists
  // and no metadata files depend on params. Dev-time validation still runs.
  unstable_disableBuildValidation: true,
}

// ─── Desktop sub-components ─────────────────────────────

function SectionHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <h2 style={{ fontSize: 32, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.6, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{title}</h2>
        {subtitle && <span style={{ fontSize: 14, color: 'var(--muted)', fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>{subtitle}</span>}
      </div>
    </div>
  )
}

function DesktopCard({ recipe, categoryName, priority }: { recipe: RecipeListItem; categoryName: string; priority?: boolean }) {
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}>
      <div style={{ aspectRatio: '4/5', borderRadius: 4, overflow: 'hidden', marginBottom: 14, position: 'relative', background: 'var(--border)', transition: 'transform 0.4s ease' }}
        className="dh-card">
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="(min-width:1024px) 25vw, 50vw" blurhash={recipe.image_blurhash} priority={priority} />
        )}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>{categoryName}</div>
      <h3 style={{ fontSize: 18, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.3, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.2 }}>{recipe.title}</h3>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>
        {recipe.time_minutes > 0 ? `${recipe.time_minutes} min` : ''}{recipe.time_minutes > 0 && recipe.servings ? ' · ' : ''}{recipe.servings || ''}
      </div>
    </Link>
  )
}

function DesktopCardWide({ recipe, categoryName, priority }: { recipe: RecipeListItem; categoryName: string; priority?: boolean }) {
  return (
    <Link href={`/rezept/${recipe.slug}`} style={{ textDecoration: 'none', display: 'flex', gap: 22, alignItems: 'center' }}>
      <div style={{ width: 200, height: 200, flexShrink: 0, borderRadius: 4, overflow: 'hidden', position: 'relative', background: 'var(--border)' }}>
        {recipe.image_url && (
          <BlurImage src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="200px" blurhash={recipe.image_blurhash} priority={priority} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>{categoryName}</div>
        <h3 style={{ fontSize: 26, fontFamily: 'var(--font-serif)', fontWeight: 400, letterSpacing: -0.4, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.1 }}>{recipe.title}</h3>
        <div style={{ display: 'flex', gap: 18, color: 'var(--muted)', fontSize: 12.5 }}>
          {recipe.time_minutes > 0 && <span>{recipe.time_minutes} min</span>}
          {recipe.servings && <span>{recipe.servings}</span>}
        </div>
      </div>
    </Link>
  )
}

function DesktopHome({ categories, allRecipes, today }: { categories: Category[]; allRecipes: RecipeListItem[]; today: string }) {
  const featured = dailyPick(allRecipes, today, 'featured')
  const quick = dailyShuffle(allRecipes.filter(r => r.time_minutes > 0 && r.time_minutes <= 25), today, 'quick').slice(0, 4)
  const hearty = dailyShuffle(allRecipes.filter(r => r.category_slug === 'hauptgerichte'), today, 'hearty').slice(0, 4)
  const sweet = dailyShuffle(allRecipes.filter(r => r.category_slug === 'backen-und-suesses' || r.category_slug === 'snacks'), today, 'sweet').slice(0, 3)
  const catMap = Object.fromEntries(categories.map(c => [c.slug, c]))

  return (
    <div>
      {/* Hero */}
      <section style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '60px 40px 80px', display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 64, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 16 }}>
              Rezept des Tages
            </div>
            <h1 style={{ fontSize: 56, fontWeight: 400, fontFamily: 'var(--font-serif)', lineHeight: 1.02, letterSpacing: -1.2, color: 'var(--text)', margin: '0 0 20px' }}>
              {featured?.title}
            </h1>
            <div style={{ display: 'flex', gap: 28, marginBottom: 36, color: 'var(--muted)', fontSize: 13.5 }}>
              {featured && featured.time_minutes > 0 && <span>{featured.time_minutes} Minuten</span>}
              {featured?.servings && <span>{featured.servings}</span>}
            </div>
            {featured && (
              <Link href={`/rezept/${featured.slug}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '14px 26px', borderRadius: 999, border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontSize: 14, fontWeight: 600, fontFamily: 'inherit', textDecoration: 'none',
              }}>
                Rezept ansehen
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7"/>
                </svg>
              </Link>
            )}
          </div>
          {featured && (
            <div style={{ aspectRatio: '5/4', borderRadius: 4, overflow: 'hidden', position: 'relative', background: 'var(--border)', boxShadow: '0 30px 80px rgba(80,50,20,0.18)' }}>
              {featured.image_url && (
                <BlurImage src={featured.image_url} alt={featured.title} fill className="object-cover" sizes="(min-width:1024px) 55vw, 100vw" priority blurhash={featured.image_blurhash} />
              )}
            </div>
          )}
        </div>
      </section>

      {/* Categories */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '64px 40px 0' }}>
        <SectionHead title="Nach Kategorie" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 24 }}>
          {categories.map(c => {
            const count = allRecipes.filter(r => r.category_slug === c.slug).length
            return (
              <Link key={c.slug} href={`/rezepte?category=${c.slug}`} style={{
                textDecoration: 'none', textAlign: 'left', padding: '24px 22px',
                background: c.accent || 'var(--accent)', color: '#fff',
                borderRadius: 18, minHeight: 140,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 22, fontFamily: 'var(--font-serif)', lineHeight: 1.1, marginBottom: 6 }}>{c.name}</div>
                  {c.description && <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.35 }}>{c.description}</div>}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85 }}>
                  {count} {count === 1 ? 'Rezept' : 'Rezepte'} →
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Quick */}
      {quick.length > 0 && (
        <section style={{ maxWidth: 1320, margin: '0 auto', padding: '64px 40px 0' }}>
          <SectionHead title="Schnell gemacht" subtitle="Unter 25 Minuten" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 24 }}>
            {quick.map((r, i) => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} priority={i === 0} />)}
          </div>
        </section>
      )}

      {/* Hearty */}
      {hearty.length > 0 && (
        <section style={{ maxWidth: 1320, margin: '0 auto', padding: '80px 40px 0' }}>
          <SectionHead title="Herzhaft & sättigend" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginTop: 24 }}>
            {hearty.map((r, i) => <DesktopCardWide key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} priority={i === 0} />)}
          </div>
        </section>
      )}

      {/* Sweet */}
      {sweet.length > 0 && (
        <section style={{ maxWidth: 1320, margin: '0 auto', padding: '80px 40px 80px' }}>
          <SectionHead title="Süßes & Snacks" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 24 }}>
            {sweet.map((r, i) => <DesktopCard key={r.slug} recipe={r} categoryName={catMap[r.category_slug]?.name ?? ''} priority={i === 0} />)}
          </div>
        </section>
      )}
    </div>
  )
}

export default async function EntdeckenPage() {
  const [categories, allRecipes, today] = await Promise.all([
    getCategories(),
    getRecipes(),
    getTodayKey(),
  ])

  const featured = dailyPick(allRecipes, today, 'featured')
  const quick = dailyShuffle(allRecipes.filter((r) => r.time_minutes > 0 && r.time_minutes <= 20), today, 'quick')
  const hearty = dailyShuffle(allRecipes.filter((r) => r.category_slug === 'hauptgerichte'), today, 'hearty').slice(0, 5)
  const sweet = dailyShuffle(
    allRecipes.filter((r) => r.category_slug === 'backen-und-suesses' || r.category_slug === 'snacks'),
    today,
    'sweet',
  ).slice(0, 10)

  const recipeCounts = categories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.slug] = allRecipes.filter((r) => r.category_slug === cat.slug).length
    return acc
  }, {})

  return (
    <>
      {featured && <PersistLastRecipe slug={featured.slug} />}

      {/* ── Desktop layout ── */}
      <div className="hidden lg:block">
        <DesktopHome categories={categories} allRecipes={allRecipes} today={today} />
      </div>

      {/* ── Mobile layout ── */}
      <div className="lg:hidden pb-6">
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
              {quick.map((r, i) => <CardCompact key={r.slug} recipe={r} priority={i === 0} />)}
            </div>
          </div>
        )}

        {/* Categories */}
        <div className="px-5 mb-8">
          <h2 className="mb-4" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3 }}>
            Nach Kategorie
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((c) => (
              <Link key={c.slug} href={`/rezepte?category=${c.slug}`} style={{ textDecoration: 'none', padding: '20px 16px', borderRadius: 18, background: c.accent || 'var(--accent)', color: '#fff', minHeight: 100, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 18, fontFamily: 'var(--font-serif)', lineHeight: 1.1 }}>{c.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.85 }}>
                  {recipeCounts[c.slug] ?? 0} Rezepte →
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Herzhaft list */}
        {hearty.length > 0 && (
          <div className="px-5 mb-8">
            <h2 className="mb-4" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', letterSpacing: -0.3 }}>
              Herzhaft & sättigend
            </h2>
            <div className="flex flex-col gap-3">
              {hearty.map((r, i) => <CardList key={r.slug} recipe={r} priority={i === 0} />)}
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
              {sweet.map((r, i) => <CardCompact key={r.slug} recipe={r} priority={i === 0} />)}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
