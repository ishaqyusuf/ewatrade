"use client"
import { ReceiptContent } from "@/components/receipts/receipt-content"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useReceiptParams } from "@/hooks/use-receipt-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"

export function ReceiptSheet({ storeId }: { storeId: string }) {
  const { receiptIds, setParams } = useReceiptParams()
  const { closeError, requestClose } = useSheetDismissal(() =>
    setParams({ receiptIds: null }),
  )
  const open = Boolean(receiptIds?.length)
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) void requestClose()
      }}
    >
      {open ? (
        <SheetFrame
          title={receiptIds?.length === 1 ? "Order receipt" : "Order receipts"}
          description="Preview and download using your saved receipt settings."
          closeError={closeError}
          popupClassName="sm:max-w-[960px]"
        >
          <ReceiptContent
            key={`${storeId}:${receiptIds?.join(",")}`}
            storeId={storeId}
            orderIds={receiptIds ?? []}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
