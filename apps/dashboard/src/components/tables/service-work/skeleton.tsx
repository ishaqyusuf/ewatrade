export function ServiceWorkTableSkeleton() {
  return (
    <div className="grid gap-2 rounded-lg border border-border p-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={`service-work-skeleton-${index + 1}`}
          className="h-12 animate-pulse rounded bg-muted"
        />
      ))}
    </div>
  )
}
