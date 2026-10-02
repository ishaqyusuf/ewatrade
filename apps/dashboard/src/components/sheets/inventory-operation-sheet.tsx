"use client"

import { InventoryOperationForm } from "@/components/inventory/inventory-operation-form"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"

type StoreSummary = { currencyCode: string; id: string; name: string }

const operationTitles = {
  adjustment: "Adjust stock",
  count: "Count stock",
  custody: "Move stock custody",
  receipt: "Receive stock",
  transfer: "Transfer stock",
  transformation: "Transform stock",
} as const

export function InventoryOperationSheet({ store }: { store: StoreSummary }) {
  const { operation, setParams } = useInventoryParams()
  const open = Boolean(operation)
  const { closeError, requestClose } = useSheetDismissal(() => setParams(null))

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {operation ? (
        <SheetFrame
          closeError={closeError}
          title={operationTitles[operation]}
          description={
            operation === "transformation"
              ? "Move exact stock between independently balanced packaged units."
              : operation === "count"
                ? "Observe the physical balance, then post any variance."
                : "Post an immutable movement against one actual balance source."
          }
        >
          <InventoryOperationForm
            key={`${store.id}:${operation}`}
            store={store}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
