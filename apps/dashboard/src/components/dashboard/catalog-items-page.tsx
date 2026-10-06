"use client"
import { CatalogItemDetailModal } from "@/components/catalog-item/catalog-item-detail-modal"

import {
  CatalogAppearance,
  useCatalogThemeClass,
} from "@/components/catalog-item/catalog-appearance"
import { CatalogHeader } from "@/components/catalog-item/catalog-header"
import { CatalogItemSheet } from "@/components/catalog-item/catalog-item-sheet"
import { CatalogUnitConfigurationSheet } from "@/components/catalog-item/catalog-unit-configuration-sheet"
import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { CatalogDataTable } from "@/components/tables/catalog/data-table"
import { CatalogTableSkeleton } from "@/components/tables/catalog/skeleton"
import type { TableSettings } from "@/utils/table-settings"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense, useState } from "react"

type StoreSummary = {
  businessProfileKey: string | null
  currencyCode: string
  id: string
  name: string
}

export function CatalogItemsPage({
  store,
  initialSettings,
}: {
  store: StoreSummary
  initialSettings: TableSettings
}) {
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <CatalogAppearance>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <CatalogHeader storeName={store.name} />
          {notice ? (
            <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </p>
          ) : null}
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={<CatalogTableSkeleton settings={initialSettings} />}
            >
              <CatalogDataTable
                initialSettings={initialSettings}
                storeId={store.id}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </ScrollableContent>
      <CatalogItemDetailModal store={store} />
      <CatalogInventorySheet store={store} />
      <CatalogUnitConfigurationSheet />
      <CatalogItemSheet
        businessProfileKey={store.businessProfileKey}
        currencyCode={store.currencyCode}
        storeId={store.id}
        onCreated={(name) => setNotice(`${name} added.`)}
      />
    </CatalogAppearance>
  )
}

function CatalogInventorySheet({ store }: { store: StoreSummary }) {
  const themeClass = useCatalogThemeClass()
  return <InventoryOperationSheet store={store} popupClassName={themeClass} />
}
