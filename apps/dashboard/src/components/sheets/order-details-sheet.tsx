"use client"

import { OrderDetails } from "@/components/orders/order-details"
import { useOrderParams } from "@/hooks/use-order-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"
import { SheetFrame } from "./sheet-frame"

export function OrderDetailsSheet({ storeId }: { storeId: string }) {
  const { sheet, orderId, setParams } = useOrderParams()
  const open = sheet === "details" && Boolean(orderId)
  const { closeError, requestClose } = useSheetDismissal(() =>
    setParams({ orderSheet: null, orderId: null }),
  )
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
    >
      {open && orderId ? (
        <SheetFrame
          title="Order details"
          description="Saved item quantities, prices and notes."
          closeError={closeError}
        >
          <OrderDetails key={orderId} orderId={orderId} storeId={storeId} />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
