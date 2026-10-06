import { Button } from "@ewatrade/ui"
export function OperationsEmpty({
  filtered,
  onClear,
}: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="grid justify-items-center gap-3 border border-border py-20 text-center">
      <h2 className="text-lg font-medium">
        {filtered ? "No matching operations" : "No operations yet"}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Try a different search or clear the filters."
          : "Stock changes recorded for this store will appear here."}
      </p>
      {filtered ? (
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
