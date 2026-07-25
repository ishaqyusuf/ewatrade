export function DomainTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      {[1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="grid grid-cols-4 gap-6 border-b border-border p-4 last:border-0"
        >
          <div className="h-4 animate-pulse rounded bg-muted" />
          <div className="h-4 animate-pulse rounded bg-muted" />
          <div className="h-4 animate-pulse rounded bg-muted" />
          <div className="h-4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}
