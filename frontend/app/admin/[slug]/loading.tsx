import { Skeleton } from '@/components/ui/skeleton'

export default function EditRecipeLoading() {
  return (
    <div className="max-w-[880px] mx-auto">

      {/* Top bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
        <Skeleton className="h-7 w-56 flex-1" />
        <div className="flex gap-2 ml-auto">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      <div className="flex flex-col gap-5">

        {/* Image card */}
        <div className="bg-white rounded-xl border border-border p-[18px] shadow-sm">
          <Skeleton className="h-2.5 w-10 mb-3" />
          <Skeleton className="w-full h-[200px] rounded-xl mb-3" />
          <Skeleton className="h-2.5 w-16 mb-2" />
          <Skeleton className="h-[38px] w-full rounded-lg" />
        </div>

        {/* Basics card */}
        <div className="bg-white rounded-xl border border-border p-[18px] shadow-sm">
          <Skeleton className="h-2.5 w-16 mb-3.5" />
          <Skeleton className="h-[38px] w-full rounded-lg mb-3" />
          <Skeleton className="h-[38px] w-full rounded-lg mb-3" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-[38px] rounded-lg" />
            <Skeleton className="h-[38px] rounded-lg" />
            <Skeleton className="h-[38px] rounded-lg" />
          </div>
        </div>

        {/* Ingredients card */}
        <div className="bg-white rounded-xl border border-border p-[18px] shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="grid grid-cols-[1fr_2fr_32px] gap-2">
                <Skeleton className="h-9 rounded-lg" />
                <Skeleton className="h-9 rounded-lg" />
                <Skeleton className="h-9 rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        {/* Steps card */}
        <div className="bg-white rounded-xl border border-border p-[18px] shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="grid grid-cols-[28px_1fr_32px] gap-2 items-start">
                <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                <Skeleton className="h-14 rounded-lg" />
                <Skeleton className="h-9 rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        {/* Notes card */}
        <div className="bg-white rounded-xl border border-border p-[18px] shadow-sm">
          <Skeleton className="h-2.5 w-20 mb-3.5" />
          <Skeleton className="h-[76px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
