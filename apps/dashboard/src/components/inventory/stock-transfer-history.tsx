"use client"

import { stockDate } from "@/lib/inventory-labels"
import { formatStockQuantity } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

export function StockTransferHistory({
  transferId,
  storeId,
}: { transferId: string; storeId?: string }) {
  const trpc = useTRPC()
  const review = useQuery(
    trpc.inventory.transferReview.queryOptions({ transferId, storeId }),
  )
  if (review.isPending)
    return (
      <output className="text-muted-foreground">Loading arrivals…</output>
    )
  if (review.isError)
    return (
      <div role="alert" className="grid gap-2">
        <p>
          Arrivals couldn’t load. Open this transfer from one of its two stores.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void review.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  const data = review.data
  return (
    <section className="grid gap-3" aria-label="Arrivals">
      <h3 className="font-medium">Arrivals</h3>
      {data.acknowledgments.length ? (
        <ol className="grid gap-3">
          {data.acknowledgments.map((entry) => (
            <li key={entry.id} className="grid gap-1 border-l pl-3">
              <p>
                {entry.kind === "RECEIVE"
                  ? "Received"
                  : "Cancelled and sent back:"}{" "}
                {formatStockQuantity(entry.quantity, data.unitName)}
              </p>
              <p className="text-muted-foreground">
                {stockDate(entry.effectiveAt)} ·{" "}
                {formatStockQuantity(entry.remainingAfter, data.unitName)} still
                on the way
              </p>
              <p className="break-words">{entry.reason}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">Nothing has arrived yet.</p>
      )}
      {data.acknowledgmentHistoryLimited ? (
        <p className="text-muted-foreground">Showing the first 100 arrivals.</p>
      ) : null}
    </section>
  )
}
