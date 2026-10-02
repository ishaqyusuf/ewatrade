"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet, type SheetContent } from "@ewatrade/ui"
import type { ComponentProps } from "react"
import { CatalogItemContent } from "./catalog-item-content"
import { CatalogItemFormProvider } from "./form-context"

type CatalogItemSheetProps = {
  finalFocus?: ComponentProps<typeof SheetContent>["finalFocus"]
  allowKindChange?: boolean
  businessProfileKey?: string | null
  currencyCode: string
  onCreated: (name: string) => void
  storeId: string
}

export function CatalogItemSheet(props: CatalogItemSheetProps) {
  const { catalogItemMode, catalogCreateKind, setCatalogItemMode } =
    useCatalogItemParams()
  const open = catalogItemMode === "create"
  const { closeError, requestClose } = useSheetDismissal(() =>
    setCatalogItemMode(null),
  )
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {open ? (
        <CatalogItemFormProvider
          key={props.storeId}
          initialKind={catalogCreateKind}
        >
          <CatalogItemContent {...props} closeError={closeError} />
        </CatalogItemFormProvider>
      ) : null}
    </Sheet>
  )
}
