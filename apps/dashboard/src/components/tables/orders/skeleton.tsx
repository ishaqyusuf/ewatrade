export function OrdersTableSkeleton() {
  return (
    <div className="grid gap-2 rounded-lg border border-border p-4">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={`order-skeleton-${index + 1}`}
          className="h-12 animate-pulse rounded bg-muted"
        />
      ))}
    </div>
  )
}
