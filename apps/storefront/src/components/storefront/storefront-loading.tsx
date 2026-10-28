import { Skeleton } from "@ewatrade/ui/skeleton"

export function StorefrontLoading({
  label = "page",
  listing = false,
}: { label?: string; listing?: boolean }) {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-6 px-6 py-12"
      aria-label={`Loading ${label}`}
    >
      <output className="sr-only">Loading {label}…</output>
      <div aria-hidden="true" className="space-y-6">
        <Skeleton className="h-9 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <div
          className={
            listing
              ? "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              : "space-y-4"
          }
        >
          {[
            "first",
            "second",
            "third",
            ...(listing ? ["fourth", "fifth", "sixth"] : []),
          ].map((key) => (
            <Skeleton
              key={key}
              className={listing ? "h-56 w-full" : "h-20 w-full"}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
