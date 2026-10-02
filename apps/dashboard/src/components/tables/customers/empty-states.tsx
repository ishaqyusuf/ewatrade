export function CustomerDirectoryEmptyState({
  filtered,
}: { filtered: boolean }) {
  return (
    <div className="grid min-h-40 place-items-center border border-border px-4 text-center">
      <div>
        <p className="font-medium">
          {filtered ? "No results" : "No customers yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered
            ? "Try another search."
            : "Customers appear here after their first order."}
        </p>
      </div>
    </div>
  )
}
