import { Skeleton } from "@ewatrade/ui"

export function ServiceIntakeSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="Loading new job form"
      className="block [&_[data-slot=skeleton]]:motion-reduce:animate-none"
    >
      <span className="sr-only">Loading services and job details…</span>
      <div aria-hidden="true" className="grid gap-6">
        <div className="grid gap-4">
          <Skeleton className="h-3 w-44 rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <div className="divide-y rounded-lg border px-4">
            {["first", "second", "third", "fourth"].map((row) => (
              <div key={row} className="flex items-center gap-4 py-4">
                <div className="grid min-w-0 flex-1 gap-2">
                  <Skeleton className="h-4 w-3/4 max-w-64 rounded-md" />
                  <Skeleton className="h-3 w-24 rounded-md" />
                </div>
                <Skeleton className="h-4 w-14 rounded-md" />
                <Skeleton className="size-8 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 border-t pt-6">
          <Skeleton className="h-3 w-32 rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <Skeleton className="h-12 w-full rounded-md" />
        <div className="flex items-center justify-between gap-4 border-t pt-4">
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </div>
    </output>
  )
}
