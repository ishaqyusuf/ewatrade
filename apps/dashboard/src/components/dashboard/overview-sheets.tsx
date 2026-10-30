"use client"

import { ActivatedSheet } from "@/components/sheets/activated-sheet"
import { loadSheetCode } from "@/components/sheets/load-sheet-code"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useOrderParams } from "@/hooks/use-order-params"
import dynamic from "next/dynamic"

const OrderCreateSheet = dynamic(() =>
  loadSheetCode(() =>
    import("@/components/sheets/order-create-sheet").then(
      (module) => module.OrderCreateSheet,
    ),
  ),
)
const InventoryOperationSheet = dynamic(() =>
  loadSheetCode(() =>
    import("@/components/sheets/inventory-operation-sheet").then(
      (module) => module.InventoryOperationSheet,
    ),
  ),
)

/**
 * URL owns activation; closed forms neither mount nor pull their dependency graph.
 * An open form's lost code offers Retry; closing its URL still unmounts it.
 */
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
        <ActivatedSheet active>
          <OrderCreateSheet
            key={`order:${store.id}`}
            store={store}
            customerDirectory={customerDirectory}
          />
        </ActivatedSheet>
      ) : null}
      {inventory && operation ? (
        <ActivatedSheet active>
          <InventoryOperationSheet key={`stock:${store.id}`} store={store} />
        </ActivatedSheet>
      ) : null}
    </>
  )
}
