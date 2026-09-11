import type { CommercialOrder } from "@/components/mobile/commerce/commerce-model"
import { getOrderDetailDispatchDocketPresentation } from "@/lib/order-detail-dispatch-docket"
import { useEffect, useState } from "react"

// Both appearances use the current delivery unlock policy and timer cleanup.
export function useOrderDetailPresentation(order: CommercialOrder) {
  const [clock, setClock] = useState(Date.now())
  const presentation = getOrderDetailDispatchDocketPresentation(
    order,
    Math.max(clock, Date.now()),
  )
  const dueAt = presentation.fulfillmentUnlockAtMs

  useEffect(() => {
    const now = Date.now()
    if (dueAt === null || dueAt <= now) return
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(dueAt - now + 50, 60_000),
    )
    return () => clearTimeout(timer)
  }, [dueAt, clock])

  return presentation
}
