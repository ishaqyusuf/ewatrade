"use client"

import { CatalogItemDetailModal } from "@/components/catalog-item/catalog-item-detail-modal"
import { CatalogUnitConfigurationSheet } from "@/components/catalog-item/catalog-unit-configuration-sheet"
import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { InventoryHeader } from "@/components/inventory/inventory-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { InventoryDataTable } from "@/components/tables/inventory/data-table"
import { InventoryTableSkeleton } from "@/components/tables/inventory/skeleton"
import { useDirectoryView } from "@/hooks/use-directory-view"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
type StoreSummary = { currencyCode: string; id: string; name: string }

export function InventoryPage({
  store,
  initialSettings,
  initialViewSettings,
  allStores = false,
}: {
  store: StoreSummary
  allStores?: boolean
  initialSettings: TableSettings
  initialViewSettings: DirectoryViewSettings
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "inventory",
      queryKey: "inventoryView",
      initialSettings: initialViewSettings,
    })
  return (
    <>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <InventoryHeader
            storeName={allStores ? "All stores" : store.name}
            view={view}
            onViewChange={setView}
          />
          {persistenceError ? (
            <Alert appearance="dashboard" role="alert">
              <AlertDescription>{persistenceError}</AlertDescription>
              <Button variant="outline" size="sm" onClick={retryPersistence}>
                Retry saving view
              </Button>
            </Alert>
          ) : null}
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={
                <InventoryTableSkeleton
                  settings={initialSettings}
                  view={view}
                />
              }
            >
              <InventoryDataTable
                storeId={allStores ? undefined : store.id}
                initialSettings={initialSettings}
                view={view}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </ScrollableContent>
      <InventoryOperationSheet store={store} />
      <CatalogItemDetailModal store={store} />
      <CatalogUnitConfigurationSheet />
    </>
  )
}
