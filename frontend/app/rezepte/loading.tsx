import { Skeleton } from '@/components/ui/skeleton'

// Real category names → pill widths
const PILLS = [48, 130, 198, 130, 75]

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

export default function RezepteLoading() {
  return (
    <>
      {/* ── Desktop (≥1024 px) ─────────────────────────────── */}
      <div className="hidden lg:block">
        <div className="max-w-[1320px] mx-auto px-10 pt-12 pb-20">

          {/* Header row */}
          <div className="flex items-end justify-between mb-8">
            <div>
              {/* "Alle Rezepte" — 48px serif */}
              <Skeleton className="h-12 w-[270px] mb-2.5" />
              {/* "98 Rezepte" count */}
              <Skeleton className="h-3.5 w-20" />
            </div>
            {/* "Sortieren: [dropdown]" */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-9 w-36 rounded-lg" />
            </div>
          </div>

          {/* Category filter pills */}
          <div className="flex gap-2.5 mb-9 pb-6 border-b border-border">
            {PILLS.map((w, i) => (
              <Skeleton key={i} style={{ width: w }} className="h-[38px] rounded-full shrink-0" />
            ))}
          </div>

          {/* 4-col recipe grid */}
          <div className="grid grid-cols-4 gap-x-8 gap-y-12">
            {Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        </div>
      </div>

      {/* ── Mobile (<1024 px) ──────────────────────────────── */}
      <div className="lg:hidden pb-6">
        <div className="px-5 pt-[70px] pb-1">
          <Skeleton className="h-8 w-36 mb-2" />
          <Skeleton className="h-3 w-20" />
        </div>
        {/* Category pills */}
        <div className="flex gap-2 px-5 py-4 overflow-hidden">
          {[48, 130, 120, 130, 75].map((w, i) => (
            <Skeleton key={i} style={{ width: w }} className="h-8 rounded-full shrink-0" />
          ))}
        </div>
        {/* Layout toggles */}
        <div className="flex gap-2 px-5 mb-4">
          {[55, 45, 50].map((w, i) => (
            <Skeleton key={i} style={{ width: w }} className="h-[26px] rounded-lg shrink-0" />
          ))}
        </div>
        {/* 2-col cover grid */}
        <div className="px-5 grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-full aspect-[5/6] rounded-[22px]" />
          ))}
        </div>
      </div>
    </>
  )
}
