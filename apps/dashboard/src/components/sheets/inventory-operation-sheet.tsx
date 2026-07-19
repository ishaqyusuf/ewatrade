"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { InventoryOperationForm } from "@/components/inventory/inventory-operation-form"
import { useInventoryParams } from "@/hooks/use-inventory-params"

type StoreSummary = { currencyCode: string; id: string; name: string }

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export function InventoryOperationSheet({ store }: { store: StoreSummary }) {
  const { operation, setParams } = useInventoryParams()

  return (
    <DashboardSheet
      open={Boolean(operation)}
      onClose={() => setParams(null)}
      title={operation ? label(operation) : "Inventory operation"}
      description={
        operation === "transformation"
          ? "Move exact stock between independently balanced packaged units."
          : operation === "count"
            ? "Observe the physical balance, then post any variance."
            : "Post an immutable movement against one actual balance source."
      }
    >
      {operation ? (
        <InventoryOperationForm key={operation} store={store} />
      ) : null}
    </DashboardSheet>
  )
}
