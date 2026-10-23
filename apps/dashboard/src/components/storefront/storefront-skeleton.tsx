import { Skeleton } from "@ewatrade/ui"

const pulse = "rounded-md motion-reduce:animate-none"

/** Shared by the route fallback and client query, without loading any merchant data. */
export function StorefrontStudioSkeleton() {
  return (
    <section
      aria-label="Storefront studio"
      aria-busy="true"
      className="flex min-h-[calc(100dvh-110px)] min-w-0 flex-col border border-border bg-background"
    >
      <output className="sr-only">Loading storefront studio…</output>
      <div
        aria-hidden="true"
        className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4"
      >
        <div className="space-y-2">
          <Skeleton className={`${pulse} h-5 w-40`} />
          <Skeleton className={`${pulse} h-3 w-56 max-w-full`} />
        </div>
        <div className="flex gap-2">
          <Skeleton className={`${pulse} hidden h-8 w-20 sm:block`} />
          <Skeleton className={`${pulse} h-8 w-20`} />
          <Skeleton className={`${pulse} h-8 w-28`} />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="grid min-w-0 flex-1 lg:grid-cols-[230px_minmax(0,1fr)]"
      >
        <div className="hidden space-y-7 border-r border-border p-5 lg:block">
          <div className="space-y-3">
            <Skeleton className={`${pulse} h-3 w-20`} />
            <Skeleton className={`${pulse} h-9 w-full`} />
          </div>
          <div className="space-y-3">
            <Skeleton className={`${pulse} h-3 w-28`} />
            {["header", "intro", "collection", "services", "footer"].map(
              (key) => (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-md border border-border p-3"
                >
                  <Skeleton className={`${pulse} size-5 shrink-0`} />
                  <Skeleton className={`${pulse} h-3 flex-1`} />
                  <Skeleton className={`${pulse} size-3 shrink-0`} />
                </div>
              ),
            )}
          </div>
          <div className="space-y-3 border-t border-border pt-5">
            <Skeleton className={`${pulse} h-3 w-20`} />
            <Skeleton className={`${pulse} h-9 w-full`} />
            <div className="flex gap-2">
              {["accent", "background", "text", "neutral"].map((key) => (
                <Skeleton
                  key={key}
                  className={`${pulse} size-8 rounded-full`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 bg-muted/30 p-3 sm:p-5">
          <div className="mb-4 flex justify-between gap-4">
            <Skeleton className={`${pulse} h-7 w-28`} />
            <Skeleton className={`${pulse} h-7 w-24`} />
          </div>
          <StorefrontCanvasPlaceholder />
        </div>
      </div>
    </section>
  )
}

export function StorefrontCanvasSkeleton() {
  return (
    <section
      aria-label="Storefront preview"
      aria-busy="true"
      className="min-w-0 p-4 sm:p-6"
    >
      <output className="sr-only">Loading storefront preview…</output>
      <div aria-hidden="true">
        <StorefrontCanvasPlaceholder />
      </div>
    </section>
  )
}

function StorefrontCanvasPlaceholder() {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <div className="flex items-center justify-between gap-5 border-b border-border px-5 py-4">
        <Skeleton className={`${pulse} h-5 w-28`} />
        <div className="flex gap-2">
          <Skeleton className={`${pulse} h-7 w-14`} />
          <Skeleton className={`${pulse} h-7 w-20`} />
        </div>
      </div>
      <div className="space-y-8 p-5 sm:p-8">
        <div className="grid items-center gap-6 sm:grid-cols-[1fr_0.7fr]">
          <div className="space-y-4 py-3">
            <Skeleton className={`${pulse} h-3 w-24`} />
            <div className="space-y-2">
              <Skeleton className={`${pulse} h-8 w-4/5`} />
              <Skeleton className={`${pulse} h-8 w-3/5`} />
            </div>
            <div className="space-y-2 pt-2">
              <Skeleton className={`${pulse} h-3 w-full`} />
              <Skeleton className={`${pulse} h-3 w-4/5`} />
            </div>
          </div>
          <Skeleton
            className={`${pulse} hidden aspect-[4/3] w-full sm:block`}
          />
        </div>
        <div className="space-y-4 border-t border-border pt-6">
          <Skeleton className={`${pulse} h-5 w-44`} />
          <div className="flex gap-2">
            {["all", "products", "services"].map((key) => (
              <Skeleton
                key={key}
                className={`${pulse} h-7 w-20 rounded-full`}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {["first", "second", "third"].map((key) => (
              <div
                key={key}
                className="space-y-3 rounded-md border border-border p-3 last:hidden xl:last:block"
              >
                <Skeleton className={`${pulse} aspect-[4/3] w-full`} />
                <Skeleton className={`${pulse} h-3 w-4/5`} />
                <Skeleton className={`${pulse} h-3 w-1/2`} />
                <Skeleton className={`${pulse} h-7 w-full`} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-between gap-4 border-t border-border px-5 py-4">
        <Skeleton className={`${pulse} h-3 w-24`} />
        <Skeleton className={`${pulse} h-3 w-16`} />
      </div>
    </div>
  )
}
