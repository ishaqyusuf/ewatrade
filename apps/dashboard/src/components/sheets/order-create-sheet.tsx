"use client"

import { OrderForm } from "@/components/orders/order-form"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useOrderParams } from "@/hooks/use-order-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function OrderCreateSheet({ store }: { store: StoreSummary }) {
  const { setParams, sheet } = useOrderParams()
  const open = sheet === "create"
  const { closeError, requestClose } = useSheetDismissal(() =>
    setParams({ orderSheet: null }),
  )

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {open ? (
        <SheetFrame
          closeError={closeError}
          title="New order"
          description="Choose items first. Customer details are optional."
        >
          <OrderForm key={`${store.id}:create`} store={store} />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
