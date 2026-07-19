"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { OrderForm } from "@/components/orders/order-form"
import { useOrderParams } from "@/hooks/use-order-params"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function OrderCreateSheet({ store }: { store: StoreSummary }) {
  const { setParams, sheet } = useOrderParams()
  const open = sheet === "create"

  return (
    <DashboardSheet
      open={open}
      onClose={() => setParams(null)}
      title="New order"
      description="Choose items first. Customer details are optional."
    >
      {open ? <OrderForm key="new-order" store={store} /> : null}
    </DashboardSheet>
  )
}
