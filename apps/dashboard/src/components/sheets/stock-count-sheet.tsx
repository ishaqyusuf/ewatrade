"use client"
import { StockCountDetails } from "@/components/inventory/stock-count-details"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useStockCountParams } from "@/hooks/use-stock-count-params"
import { Sheet } from "@ewatrade/ui"
import { SheetFrame } from "./sheet-frame"
export function StockCountSheet({ storeId }: { storeId: string }) {
  const { stockCountId, close } = useStockCountParams()
  const { closeError, requestClose } = useSheetDismissal(close)
  return (
    <Sheet
      open={Boolean(stockCountId)}
      onOpenChange={(open) => {
        if (!open) void requestClose()
      }}
    >
      {stockCountId ? (
        <SheetFrame
          title="Stock count"
          description="Saved physical observations and their stock adjustment."
          closeError={closeError}
        >
          <StockCountDetails
            key={`${storeId}:${stockCountId}`}
            storeId={storeId}
            stockCountId={stockCountId}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
