import Image from 'next/image'
import Link from 'next/link'
import type { RecipeListItem, Category } from '@/lib/api'

interface CardProps {
  recipe: RecipeListItem
  category?: Category
}

// Shared meta pill
function TimePill({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: 'var(--muted)' }}>
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
      </svg>
      {minutes} min
    </span>
  )
}

// 1. GRID — classic card with photo + meta
export function CardGrid({ recipe, category }: CardProps) {
  return (
    <Link href={`/rezept/${recipe.slug}`} className="no-underline block rounded-[18px] overflow-hidden"
      style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
      <div className="relative" style={{ aspectRatio: '4/3' }}>
        {recipe.image_url ? (
          <Image src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="50vw" />
        ) : (
          <div className="w-full h-full" style={{ background: 'var(--border)' }} />
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold mb-1 line-clamp-2" style={{ fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2 }}>
          {recipe.title}
        </p>
        <TimePill minutes={recipe.time_minutes} />
      </div>
    </Link>
  )
}

// 2. LIST — horizontal photo + text
export function CardList({ recipe, category }: CardProps) {
  return (
    <Link href={`/rezept/${recipe.slug}`} className="no-underline flex gap-3 p-3 rounded-2xl"
      style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
      <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 92, height: 92 }}>
        {recipe.image_url ? (
          <Image src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="92px" />
        ) : (
          <div className="w-full h-full" style={{ background: 'var(--border)' }} />
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {category && (
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 3 }}>
            {category.name}
          </p>
        )}
        <p className="font-semibold mb-1" style={{ fontSize: 16, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.25 }}>
          {recipe.title}
        </p>
        <TimePill minutes={recipe.time_minutes} />
      </div>
    </Link>
  )
}

// 3. COVER — full-bleed cinematic card
export function CardCover({ recipe, category }: CardProps) {
  return (
    <Link href={`/rezept/${recipe.slug}`} className="no-underline relative block rounded-[22px] overflow-hidden"
      style={{ aspectRatio: '5/6', boxShadow: 'var(--card-shadow)' }}>
      {recipe.image_url ? (
        <Image src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="50vw" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'var(--muted)' }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.15) 45%, transparent 70%)' }} />
      <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', color: 'var(--text)', fontSize: 10 }}>
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
        </svg>
        {recipe.time_minutes}'
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
        {category && (
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85, marginBottom: 3 }}>
            {category.name}
          </p>
        )}
        <p className="font-semibold" style={{ fontSize: 17, fontFamily: 'var(--font-serif)', lineHeight: 1.15, letterSpacing: -0.2 }}>
          {recipe.title}
        </p>
      </div>
    </Link>
  )
}

// 4. COMPACT — for carousels
export function CardCompact({ recipe }: CardProps) {
  return (
    <Link href={`/rezept/${recipe.slug}`} className="no-underline flex-shrink-0" style={{ width: 180 }}>
      <div className="relative rounded-2xl overflow-hidden mb-2.5" style={{ width: 180, height: 180, boxShadow: 'var(--card-shadow)' }}>
        {recipe.image_url ? (
          <Image src={recipe.image_url} alt={recipe.title} fill className="object-cover" sizes="180px" />
        ) : (
          <div className="w-full h-full" style={{ background: 'var(--border)' }} />
        )}
      </div>
      <p className="font-semibold line-clamp-2 mb-1" style={{ fontSize: 14, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.25 }}>
        {recipe.title}
      </p>
      <TimePill minutes={recipe.time_minutes} />
    </Link>
  )
}
