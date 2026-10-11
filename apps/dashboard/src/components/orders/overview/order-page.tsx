"use client"

import { useRouter } from "next/navigation"
import { OrderOverview } from "./order-overview"

/** The full order page: the same overview as the order modal, with room. */
export function OrderPage({
  orderId,
  storeId,
}: { orderId: string; storeId: string }) {
  const router = useRouter()
  return (
    <div className="pt-4 pb-10 md:pt-6">
      <OrderOverview
        orderId={orderId}
        storeId={storeId}
        layout="page"
        onOpenOrder={(id) =>
          router.push(`/sales/orders/${encodeURIComponent(id)}`)
        }
      />
    </div>
  )
}
