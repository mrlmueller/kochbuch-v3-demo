import { Skeleton } from '@/components/ui/skeleton'

export default function RecipeDetailLoading() {
  return (
    <>
      {/* ── Desktop (≥1024 px) ─────────────────────────────── */}
      <div className="hidden lg:block">

        {/* Hero */}
        <section className="max-w-[1320px] mx-auto px-10 pt-8 pb-0">
          <Skeleton className="h-4 w-20 mb-7" />
          <div className="grid grid-cols-[1fr_1.1fr] gap-14 items-center">
            <div>
              <Skeleton className="h-3 w-24 mb-4" />
              <Skeleton className="h-16 w-full mb-3" />
              <Skeleton className="h-16 w-4/5 mb-7" />
              <div className="flex gap-9 pt-7 border-t border-border">
                <div>
                  <Skeleton className="h-2.5 w-10 mb-1.5" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <div>
                  <Skeleton className="h-2.5 w-16 mb-1.5" />
                  <Skeleton className="h-6 w-16" />
                </div>
                <div>
                  <Skeleton className="h-2.5 w-14 mb-1.5" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
              </div>
            </div>
            {/* 4/5 portrait image */}
            <Skeleton className="w-full aspect-[4/5] rounded-[4px]" />
          </div>
        </section>

        {/* Body — sticky ingredients + steps */}
        <section className="max-w-[1320px] mx-auto px-10 pt-20 pb-20">
          <div className="grid grid-cols-[380px_1fr] gap-20 items-start">

            {/* Ingredients sidebar */}
            <div>
              <Skeleton className="h-2.5 w-16 mb-3.5" />
              <Skeleton className="h-3.5 w-36 mb-5" />
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3.5 py-3 border-b border-border">
                  <Skeleton className="w-5 h-5 rounded-[5px] shrink-0" />
                  <Skeleton className="h-3.5 flex-1" style={{ width: `${50 + (i * 17) % 35}%` }} />
                  <Skeleton className="h-3.5 w-12 shrink-0" />
                </div>
              ))}
            </div>

            {/* Steps */}
            <div>
              <Skeleton className="h-2.5 w-24 mb-3.5" />
              <Skeleton className="h-8 w-48 mb-8" />
              <div className="flex flex-col gap-7">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-6">
                    <Skeleton className="w-14 h-11 shrink-0 rounded" />
                    <div className="flex-1 pt-1 flex flex-col gap-2">
                      <Skeleton className="h-[17px] w-full" />
                      <Skeleton className="h-[17px] w-11/12" />
                      {i % 2 === 0 && <Skeleton className="h-[17px] w-3/4" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── Mobile (<1024 px) ──────────────────────────────── */}
      <div className="lg:hidden pb-10">
        <Skeleton className="h-[460px] w-full rounded-none" />
        <div className="px-6 pt-7 text-center flex flex-col items-center">
          <Skeleton className="h-2.5 w-20 mb-2" />
          <Skeleton className="h-8 w-4/5 mb-2" />
          <Skeleton className="h-8 w-3/5 mb-3.5" />
          <Skeleton className="h-px w-8 mb-3.5" />
        </div>
        <div className="flex justify-center gap-8 px-5 py-6 border-b border-border">
          {[['h-2.5 w-8', 'h-[18px] w-16'], ['h-2.5 w-16', 'h-[18px] w-12']].map(([a, b], i) => (
            <div key={i} className="text-center flex flex-col items-center gap-1.5">
              <Skeleton className={a} />
              <Skeleton className={b} />
            </div>
          ))}
        </div>
        <div className="px-6 py-6">
          <Skeleton className="h-2.5 w-16 mx-auto mb-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between py-2.5 border-b border-border">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3.5 w-12" />
            </div>
          ))}
        </div>
        <div className="px-6 py-2">
          <Skeleton className="h-2.5 w-20 mx-auto mb-5" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 mb-6">
              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <Skeleton className="h-[15px] w-full" />
                <Skeleton className="h-[15px] w-5/6" />
                {i % 2 === 0 && <Skeleton className="h-[15px] w-2/3" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
