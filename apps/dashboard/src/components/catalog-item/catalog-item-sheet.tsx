"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"

import { CatalogItemContent } from "./catalog-item-content"
import { CatalogItemFormProvider } from "./form-context"

type CatalogItemSheetProps = {
  currencyCode: string
  onCreated: (name: string) => void
  storeId: string
}

export function CatalogItemSheet({
  currencyCode,
  onCreated,
  storeId,
}: CatalogItemSheetProps) {
  const { catalogItemMode, setCatalogItemMode } = useCatalogItemParams()
  const open = catalogItemMode === "create"

  return (
    <DashboardSheet
      open={open}
      onClose={() => setCatalogItemMode(null)}
      title="Add item"
      description="Start with the essentials."
    >
      <CatalogItemFormProvider key={open ? "open" : "closed"}>
        <CatalogItemContent
          currencyCode={currencyCode}
          onCreated={onCreated}
          storeId={storeId}
        />
      </CatalogItemFormProvider>
    </DashboardSheet>
  )
}
