"use client"

import { inventoryDate } from "@/components/tables/inventory-ledger/format"
import { formatInventoryQuantity } from "@/lib/inventory-view"
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
      <p role="status" className="text-muted-foreground">
        Loading transfer history…
      </p>
    )
  if (review.isError)
    return (
      <div role="alert" className="grid gap-2">
        <p>
          Transfer history is unavailable. Check access to both Stores and
          select a Store participating in this transfer.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void review.refetch()}
        >
          Retry history
        </Button>
      </div>
    )
  const data = review.data
  return (
    <section
      className="grid gap-3"
      aria-label="Transfer acknowledgment history"
    >
      <h3 className="font-medium">Receipt and return history</h3>
      <p className="text-muted-foreground">
        {formatInventoryQuantity(data.transit?.quantity ?? "0")} {data.unitName}{" "}
        remaining in transit. Original dispatch:{" "}
        {formatInventoryQuantity(data.dispatchedQuantity)} {data.unitName}.
      </p>
      {data.acknowledgments.length ? (
        <ol className="grid gap-3">
          {data.acknowledgments.map((entry) => (
            <li key={entry.id} className="grid gap-1 border-l pl-3">
              <p>
                {entry.kind === "RECEIVE" ? "Received" : "Returned"}{" "}
                {formatInventoryQuantity(entry.quantity)} {data.unitName}
              </p>
              <p className="text-muted-foreground">
                {formatInventoryQuantity(entry.remainingAfter)} {data.unitName}{" "}
                left in transit · {inventoryDate(entry.effectiveAt)}
              </p>
              <p className="break-words">{entry.reason}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">
          No detailed acknowledgments are available for this transfer.
        </p>
      )}
      {data.acknowledgmentHistoryLimited ? (
        <p className="text-muted-foreground">
          Showing the first 100 acknowledgments.
        </p>
      ) : null}
    </section>
  )
}
