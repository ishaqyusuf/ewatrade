"use client"

import {
  OrderOverview,
  OrderPills,
  orderSubline,
} from "@/components/orders/overview/order-overview"
import { useOrderParams } from "@/hooks/use-order-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useTRPC } from "@/trpc/client"
import { Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"

export function OrderDetailsSheet({
  storeId,
  fullPage,
  timeZone,
}: { storeId: string; fullPage: boolean; timeZone: string }) {
  const { sheet, orderId, setParams } = useOrderParams()
  const open = sheet === "details" && Boolean(orderId)
  const close = () => setParams({ orderSheet: null, orderId: null })
  const { closeError, requestClose } = useSheetDismissal(close)
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
    >
      {open && orderId ? (
        <OrderSheetBody
          key={orderId}
          orderId={orderId}
          storeId={storeId}
          closeError={closeError}
          fullPage={fullPage}
          timeZone={timeZone}
          onLeave={close}
          onOpenOrder={(id) =>
            void setParams({ orderSheet: "details", orderId: id })
          }
        />
      ) : null}
    </Sheet>
  )
}

function OrderSheetBody({
  orderId,
  storeId,
  closeError,
  fullPage,
  timeZone,
  onLeave,
  onOpenOrder,
}: {
  orderId: string
  storeId: string
  closeError: string | null
  fullPage: boolean
  timeZone: string
  onLeave: () => Promise<unknown>
  onOpenOrder: (orderId: string) => void
}) {
  const trpc = useTRPC()
  // Same cache entry the overview reads; titles the modal once it loads.
  const order = useQuery(
    trpc.orders.get.queryOptions({ orderId }, { retry: false }),
  ).data
  const loaded = order && order.storeId === storeId ? order : null
  return (
    <SheetFrame
      title={loaded?.orderNumber ?? "Order details"}
      description={loaded ? orderSubline(loaded, timeZone) : undefined}
      header={loaded ? <OrderPills order={loaded} /> : null}
      closeError={closeError}
      popupClassName="sm:w-[min(1180px,96vw)] sm:max-w-[1180px]"
    >
      <OrderOverview
        orderId={orderId}
        storeId={storeId}
        layout="sheet"
        timeZone={timeZone}
        onLeave={onLeave}
        onOpenOrder={onOpenOrder}
        fullPageHref={
          fullPage ? `/sales/orders/${encodeURIComponent(orderId)}` : undefined
        }
      />
    </SheetFrame>
  )
}
