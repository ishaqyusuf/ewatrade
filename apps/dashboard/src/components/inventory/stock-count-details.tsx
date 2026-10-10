"use client"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
export function StockCountDetails({
  storeId,
  stockCountId,
}: { storeId: string; stockCountId: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.inventory.stockCountReview.queryOptions(
      { storeId, stockCountId },
      { staleTime: 0 },
    ),
  )
  if (query.isPending)
    return <output aria-live="polite">Loading saved count…</output>
  if (query.isError)
    return (
      <div role="alert" className="grid gap-3">
        <p>{query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  const count = query.data
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p className="text-sm font-medium">
          {count.status === "DRAFT" ? "Draft count" : "Finalized count"}
        </p>
        <p className="text-sm text-muted-foreground">
          {count.reason ?? "No observation note"}
        </p>
        <p className="text-xs text-muted-foreground break-all">
          Count {count.id}
        </p>
      </div>
      {count.status === "DRAFT" ? (
        <output className="rounded-md border p-3 text-sm">
          {count.canFinalize
            ? "Observations are current. Ask the assistant to review this count for finalization; a separate confirmation applies the adjustment."
            : "Stock or units changed. Create and review fresh observations before finalization."}
        </output>
      ) : (
        <p className="text-sm text-muted-foreground">
          Finalized{" "}
          {count.finalizedAt
            ? new Date(count.finalizedAt).toLocaleString()
            : ""}
          . The retained observation and variance below describe that
          adjustment.
        </p>
      )}
      {!count.lines.length ? (
        <p>No observations were recorded.</p>
      ) : (
        count.lines.map((line) => (
          <section key={line.id} className="grid gap-3 rounded-md border p-4">
            <h3 className="font-medium">
              {line.productName} · {line.variantName}
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>System at count</dt>
              <dd>
                {line.expectedQuantity} {line.unitName}
              </dd>
              <dt>Counted</dt>
              <dd>
                {line.observedQuantity} {line.unitName}
              </dd>
              <dt>Signed variance</dt>
              <dd>
                {line.varianceQuantity} {line.unitName}
              </dd>
              <dt>Current on hand</dt>
              <dd>
                {line.currentQuantity} {line.unitName}
              </dd>
              <dt>Reserved</dt>
              <dd>
                {line.reservedQuantity} {line.unitName}
              </dd>
            </dl>
            <ul className="grid gap-1 text-xs text-muted-foreground">
              {line.entries.map((entry, index) => (
                <li key={`${entry.enteredInventoryUnitId}:${index}`}>
                  {entry.enteredQuantity} {entry.unitName} × {entry.factor} ={" "}
                  {entry.canonicalQuantity} canonical units
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <Button
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh count
      </Button>
    </div>
  )
}
