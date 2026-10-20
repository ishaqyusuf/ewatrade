"use client"
import { stockDate } from "@/lib/inventory-labels"
import { formatStockQuantity } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
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
          {count.status === "DRAFT"
            ? "Saved count, not finished"
            : count.status === "CANCELLED"
              ? "Discarded count"
              : "Finished count"}
        </p>
        {count.reason ? (
          <p className="text-sm text-muted-foreground">{count.reason}</p>
        ) : null}
      </div>
      {count.status === "DRAFT" ? (
        <output className="rounded-md border p-3 text-sm">
          {count.canFinalize
            ? "Stock hasn’t changed yet. Open Count stock in Inventory to finish or discard it."
            : "Stock changed since this count, so it can’t be finished. Open Count stock in Inventory to count again or discard it."}
        </output>
      ) : count.status === "FINALIZED" ? (
        <p className="text-sm text-muted-foreground">
          Finished {count.finalizedAt ? stockDate(count.finalizedAt) : ""}.
          Stock was set to what was counted.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Discarded. Stock did not change.
        </p>
      )}
      {!count.lines.length ? (
        <p>Nothing was counted.</p>
      ) : (
        count.lines.map((line) => (
          <section key={line.id} className="grid gap-3 rounded-md border p-4">
            <h3 className="font-medium">
              {line.variantName && line.variantName !== line.productName
                ? `${line.productName} · ${line.variantName}`
                : line.productName}
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>Expected</dt>
              <dd>
                {formatStockQuantity(line.expectedQuantity, line.unitName)}
              </dd>
              <dt>Counted</dt>
              <dd>
                {formatStockQuantity(line.observedQuantity, line.unitName)}
              </dd>
              <dt>Difference</dt>
              <dd>
                {compareExactDecimals(line.varianceQuantity, "0") === 0
                  ? "Matches"
                  : `${compareExactDecimals(line.varianceQuantity, "0") > 0 ? "+" : "−"}${formatStockQuantity(line.varianceQuantity.replace(/^-/, ""), line.unitName)}`}
              </dd>
              <dt>In stock now</dt>
              <dd>
                {formatStockQuantity(line.currentQuantity, line.unitName)}
              </dd>
              <dt>Held for orders</dt>
              <dd>
                {formatStockQuantity(line.reservedQuantity, line.unitName)}
              </dd>
            </dl>
          </section>
        ))
      )}
      <Button
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        Reload
      </Button>
    </div>
  )
}
