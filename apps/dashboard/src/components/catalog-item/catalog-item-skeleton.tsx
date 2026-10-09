import { Skeleton } from "@ewatrade/ui"

export function CatalogItemSkeleton({
  chat = false,
}: {
  chat?: boolean
}) {
  return (
    <output
      aria-busy="true"
      aria-label={chat ? "Loading product chat" : "Loading product form"}
      className="block [&_[data-slot=skeleton]]:motion-reduce:animate-none"
    >
      <span className="sr-only">
        {chat ? "Preparing your product chat…" : "Opening your product form…"}
      </span>
      {chat ? (
        <div
          aria-hidden="true"
          className="grid h-[min(700px,calc(100svh-12rem))] min-h-96 gap-4 md:grid-cols-[minmax(0,1fr)_280px]"
        >
          <div className="flex min-h-0 flex-col rounded-lg border p-4">
            <Skeleton className="h-4 w-28 rounded-md" />
            <div className="mt-8 flex flex-1 flex-col gap-5">
              <Skeleton className="h-20 w-4/5 rounded-lg" />
              <Skeleton className="ml-auto h-14 w-2/3 rounded-lg" />
              <Skeleton className="h-24 w-3/4 rounded-lg" />
            </div>
            <Skeleton className="mt-6 h-24 w-full rounded-lg" />
          </div>
          <div className="hidden space-y-6 rounded-lg border bg-muted/20 p-4 md:block">
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="h-6 w-4/5 rounded-md" />
            {["unit", "price", "stock", "category"].map((field) => (
              <div key={field} className="space-y-2">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-5 w-3/5 rounded-md" />
              </div>
            ))}
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      ) : (
        <div aria-hidden="true" className="space-y-6">
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-20 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-1/3 rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {["usage", "unit", "price", "stock"].map((field) => (
              <div key={field} className="space-y-3">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
            ))}
          </div>
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      )}
    </output>
  )
}
