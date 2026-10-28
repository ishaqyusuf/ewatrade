"use client"

import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useOrderParams } from "@/hooks/use-order-params"
import dynamic from "next/dynamic"

const OrderCreateSheet = dynamic(() =>
  import("@/components/sheets/order-create-sheet").then(
    (module) => module.OrderCreateSheet,
  ),
)
const InventoryOperationSheet = dynamic(() =>
  import("@/components/sheets/inventory-operation-sheet").then(
    (module) => module.InventoryOperationSheet,
  ),
)

/** URL owns activation; closed forms neither mount nor pull their dependency graph. */
export function OverviewSheets({
  store,
  orders,
  inventory,
  customerDirectory,
}: {
  store: { id: string; name: string; currencyCode: string }
  orders: boolean
  inventory: boolean
  customerDirectory: boolean
}) {
  const { sheet } = useOrderParams()
  const { operation } = useInventoryParams()
  return (
    <>
      {orders && sheet === "create" ? (
        <OrderCreateSheet
          key={`order:${store.id}`}
          store={store}
          customerDirectory={customerDirectory}
        />
      ) : null}
      {inventory && operation ? (
        <InventoryOperationSheet key={`stock:${store.id}`} store={store} />
      ) : null}
    </>
  )
}
