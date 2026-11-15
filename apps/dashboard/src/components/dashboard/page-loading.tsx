/** Shell route loading: a toolbar line, then the page body, in the surface radius. */
export function PageLoading() {
  return (
    <output className="grid min-w-0 gap-4 pt-6" aria-label="Loading page">
      <div className="flex gap-3">
        <div className="h-11 min-w-0 flex-1 animate-pulse rounded-[var(--ui-radius-control)] border border-border bg-card sm:max-w-sm" />
        <div className="h-11 w-28 animate-pulse rounded-[var(--ui-radius-control)] border border-border bg-card" />
      </div>
      <div
        data-summary-grid
        data-summary-skeleton
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={`summary-${index + 1}`}
            className="h-24 animate-pulse rounded-[var(--ui-radius-surface)] border border-border bg-card"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-[var(--ui-radius-surface)] border border-border bg-card" />
    </output>
  )
}
