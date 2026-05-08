import { Skeleton } from '@/components/ui/skeleton'

// ── Reusable pieces ───────────────────────────────────────────

// Matches <DesktopCard> — portrait 4/5 image, category label, title, meta
function CardSkeleton() {
  return (
    <div>
      <Skeleton className="w-full aspect-[4/5] rounded-[4px] mb-3.5" />
      <Skeleton className="h-2.5 w-1/2 mb-2" />
      <Skeleton className="h-[18px] w-11/12 mb-1.5" />
      <Skeleton className="h-3 w-5/12" />
    </div>
  )
}

// Matches <DesktopCardWide> — 200×200 image + text side
function CardWideSkeleton() {
  return (
    <div className="flex gap-[22px] items-center">
      <Skeleton className="w-[200px] h-[200px] shrink-0 rounded-[4px]" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-2.5 w-2/5 mb-2.5" />
        <Skeleton className="h-[26px] w-11/12 mb-2" />
        <Skeleton className="h-[26px] w-2/3 mb-3.5" />
        <div className="flex gap-4">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  )
}

// Matches <SectionHead> — 32px serif title + optional subtitle + border-bottom
function SectionHead({ subtitle = false }: { subtitle?: boolean }) {
  return (
    <div className="flex items-baseline gap-3.5 border-b border-border pb-3.5 mb-6">
      <Skeleton className={`h-8 ${subtitle ? 'w-48' : 'w-52'}`} />
      {subtitle && <Skeleton className="h-3.5 w-32" />}
    </div>
  )
}

// ── Loading UI ────────────────────────────────────────────────

export default function HomeLoading() {
  return (
    <>
      {/* ── Desktop (≥1024 px) ─────────────────────────────── */}
      <div className="hidden lg:block">

        {/* 1. Hero — left 1fr, right 1.3fr */}
        <section className="border-b border-border">
          <div className="max-w-[1320px] mx-auto px-10 pt-[60px] pb-20 grid grid-cols-[1fr_1.3fr] gap-16 items-center">
            <div>
              <Skeleton className="h-[11px] w-32 mb-5" />
              <Skeleton className="h-14 w-11/12 mb-6" />
              <div className="flex gap-7 mb-9">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-7" />
              </div>
              <Skeleton className="h-[46px] w-40 rounded-full" />
            </div>
            {/* 5/4 landscape image */}
            <Skeleton className="w-full aspect-[5/4] rounded-[4px]" />
          </div>
        </section>

        {/* 2. Nach Kategorie — 4 landscape tiles */}
        <section className="max-w-[1320px] mx-auto px-10 pt-16">
          <SectionHead />
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="min-h-[140px] rounded-[18px]" />
            ))}
          </div>
        </section>

        {/* 3. Schnell gemacht — 4 portrait cards */}
        <section className="max-w-[1320px] mx-auto px-10 pt-16">
          <SectionHead subtitle />
          <div className="grid grid-cols-4 gap-6">
            {[0, 1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
        </section>

        {/* 4. Herzhaft & sättigend — 2-col wide cards (4 items) */}
        <section className="max-w-[1320px] mx-auto px-10 pt-20">
          <SectionHead />
          <div className="grid grid-cols-2 gap-6">
            {[0, 1, 2, 3].map(i => <CardWideSkeleton key={i} />)}
          </div>
        </section>

        {/* 5. Süßes & Snacks — 3 portrait cards */}
        <section className="max-w-[1320px] mx-auto px-10 pt-20 pb-20">
          <SectionHead />
          <div className="grid grid-cols-3 gap-6">
            {[0, 1, 2].map(i => <CardSkeleton key={i} />)}
          </div>
        </section>
      </div>

      {/* ── Mobile (<1024 px) ──────────────────────────────── */}
      <div className="lg:hidden pb-6">
        <div className="px-5 pt-[70px] pb-6">
          <Skeleton className="h-3 w-24 mb-3" />
          <Skeleton className="h-8 w-4/5 mb-2" />
          <Skeleton className="h-8 w-[55%]" />
        </div>
        {/* Featured hero */}
        <div className="px-5 mb-8">
          <Skeleton className="w-full aspect-[4/5] rounded-[24px]" />
        </div>
        {/* Quick carousel */}
        <div className="mb-8">
          <Skeleton className="h-5 w-40 mx-5 mb-3.5" />
          <div className="flex gap-3 px-5 overflow-hidden">
            {[0, 1, 2].map(i => (
              <div key={i} className="shrink-0 w-[180px]">
                <Skeleton className="w-[180px] h-[180px] rounded-2xl mb-2.5" />
                <Skeleton className="h-3.5 w-4/5 mb-1.5" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
        {/* Categories */}
        <div className="px-5">
          <Skeleton className="h-5 w-36 mb-4" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="h-[100px] rounded-[18px]" />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
