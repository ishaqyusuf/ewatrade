"use client"

import { InventoryOperationForm } from "@/components/inventory/inventory-operation-form"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useTRPC } from "@/trpc/client"
import { Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

type StoreSummary = { currencyCode: string; id: string; name: string }

const operationTitles = {
  adjustment: "Adjust stock",
  count: "Count stock",
  custody: "Move stock custody",
  receipt: "Receive stock",
  transfer: "Transfer stock",
  transformation: "Transform stock",
} as const

export function InventoryOperationSheet({
  store,
  popupClassName,
}: { store: StoreSummary; popupClassName?: string }) {
  const { operation, productId, balanceId, preset, storeId, setParams } =
    useInventoryParams()
  const trpc = useTRPC()
  const stores = useQuery(
    trpc.tenant.stores.queryOptions(undefined, {
      enabled: Boolean(operation && storeId),
    }),
  )
  const selectedStore = storeId
    ? stores.data?.find((candidate) => candidate.id === storeId)
    : store
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
          popupClassName={popupClassName}
          title={
            operation === "adjustment" && preset === "loss"
              ? "Record damage or loss"
              : operationTitles[operation]
          }
          description={
            operation === "transfer"
              ? "Choose the source and destination stores, then the stock to move."
              : operation === "transformation"
                ? "Move exact stock between independently balanced packaged units."
                : operation === "count"
                  ? "Observe the physical balance, then post any variance."
                  : "Choose stock in this store and record the quantity change."
          }
        >
          {selectedStore ? (
            <InventoryOperationForm
              key={`${selectedStore.id}:${operation}:${productId ?? "all"}:${balanceId ?? "all"}:${preset ?? "default"}`}
              store={selectedStore}
            />
          ) : (
            <p>
              {stores.isError
                ? "Could not load stores. Close and try again."
                : "Loading store…"}
            </p>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
