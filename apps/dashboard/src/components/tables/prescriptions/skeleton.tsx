export function PrescriptionTableSkeleton() {
  return (
    <div className="grid gap-2 rounded-lg border border-border p-4">
      {Array.from({ length: 10 }, (_, index) => (
        <div
          key={`prescription-skeleton-${index + 1}`}
          className="h-12 animate-pulse rounded bg-muted"
        />
      ))}
    </div>
  )
}
