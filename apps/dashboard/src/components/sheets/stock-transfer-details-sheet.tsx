"use client"
import { useStockTransferParams } from "@/hooks/use-stock-transfer-params"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"
import { StockTransferSheet } from "./stock-transfer-sheet"

export function StockTransferDetailsSheet({ storeId }: { storeId: string }) {
  const { transferId, close } = useStockTransferParams()
  const trpc = useTRPC()
  const query = useQuery(
    trpc.inventory.transferReview.queryOptions(
      { transferId: transferId ?? "", storeId },
      { enabled: Boolean(transferId), retry: false, staleTime: 0 },
    ),
  )
  const saved = query.data
  if (saved && saved.id === transferId)
    return (
      <StockTransferSheet
        key={saved.id}
        record={{
          id: saved.id,
          createdAt: saved.createdAt,
          inventoryUnitName: saved.unitName,
          productName: saved.productName,
          variantName: saved.variantName,
          quantity: saved.dispatchedQuantity,
          remainingQuantity: saved.transit?.quantity ?? "0",
          sourceStore: saved.sourceStore,
          targetStore: saved.targetStore,
          transitRevision: saved.transit?.revision ?? null,
          status: saved.status,
        }}
        storeId={storeId}
        onClose={() => void close()}
      />
    )
  return (
    <Sheet
      open={Boolean(transferId)}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {transferId ? (
        <SheetFrame
          title="Stock transfer"
          description="Saved transfer and acknowledgment history."
        >
          {query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>
                This transfer is unavailable in the selected Store. Check access
                to both Stores.
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <output>Loading saved transfer…</output>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
