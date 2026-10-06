export function PageLoading() {
  return (
    <output className="grid min-w-0 gap-6 pt-6" aria-label="Loading page">
      <div className="h-8 w-40 animate-pulse bg-muted" />
      <div
        data-summary-grid
        data-summary-skeleton
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={`summary-${index + 1}`}
            className="h-28 animate-pulse border border-border bg-muted"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse border border-border bg-muted" />
    </output>
  )
}
