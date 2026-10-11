"use client"

import { useRouter } from "next/navigation"
import { OrderOverview } from "./order-overview"

/** The full order page: the same overview as the order modal. Bottom room keeps the note box clear of the assistant button. */
export function OrderPage({
  orderId,
  storeId,
  timeZone,
}: { orderId: string; storeId: string; timeZone: string }) {
  const router = useRouter()
  return (
    <div className="pt-4 pb-24 md:pt-6">
      <OrderOverview
        orderId={orderId}
        storeId={storeId}
        layout="page"
        timeZone={timeZone}
        onOpenOrder={(id) =>
          router.push(`/sales/orders/${encodeURIComponent(id)}`)
        }
      />
    </div>
  )
}
