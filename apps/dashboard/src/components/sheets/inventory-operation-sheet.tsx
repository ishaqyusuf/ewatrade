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
  adjustment: "Correct stock",
  count: "Count stock",
  custody: "Hand to staff",
  internal_use: "Used in the business",
  receipt: "Stock in",
  transfer: "Send to another store",
  transformation: "Pack or unpack",
} as const

const operationDescriptions = {
  adjustment:
    "Fix a number that is wrong. To check everything on the shelf, use Count stock.",
  count: "Type what you find on the shelf. Stock is set to your count.",
  custody:
    "Track stock a staff member carries to sell, such as on a van or at a stall.",
  internal_use: "Stock the business used itself, not sold.",
  receipt: "Add stock that arrived: collected, bought or returned.",
  transfer: "Move stock to another of your stores.",
  transformation: "Move stock between loose stock and packs kept separately.",
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
              ? "Damaged or lost"
              : operationTitles[operation]
          }
          description={
            operation === "adjustment" && preset === "loss"
              ? "Remove stock that broke, died, expired or went missing."
              : operationDescriptions[operation]
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
                ? "Your stores couldn’t load. Close and try again."
                : "Loading…"}
            </p>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
