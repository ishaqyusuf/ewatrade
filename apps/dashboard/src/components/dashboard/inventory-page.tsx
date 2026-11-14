"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { InventoryFilters } from "@/components/inventory/inventory-filters"
import {
  type InventoryPageAccess,
  InventoryPageHeader,
  inventoryViewOptions,
} from "@/components/inventory/inventory-header"
import { InventoryActions } from "@/components/inventory/inventory-operation-menu"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import {
  TableToolbarSlot,
  TableToolbarSlotProvider,
} from "@/components/tables/core"
import { InventoryDataTable } from "@/components/tables/inventory/data-table"
import { InventoryTableSkeleton } from "@/components/tables/inventory/skeleton"
import { ViewDropdown } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { useMobileOverlay } from "@/hooks/use-mobile-overlay"
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
  storePicker,
  showShipments,
}: InventoryPageAccess & {
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
  // Phones hide the view menu and always get the readable list.
  const phone = useMobileOverlay()
  const shownView = phone ? "list" : view
  return (
    <TableToolbarSlotProvider>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-4 pt-4 pb-8">
          <InventoryPageHeader
            storePicker={storePicker}
            showShipments={showShipments}
            search={<InventoryFilters />}
            actions={
              <>
                <div className="flex items-center gap-2 max-md:hidden">
                  <TableToolbarSlot />
                  <ViewDropdown
                    label="Stock view"
                    value={view}
                    options={inventoryViewOptions}
                    onValueChange={setView}
                  />
                </div>
                <InventoryActions />
              </>
            }
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
                  view={shownView}
                />
              }
            >
              <InventoryDataTable
                storeId={allStores ? undefined : store.id}
                initialSettings={initialSettings}
                view={shownView}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </ScrollableContent>
      <InventoryOperationSheet store={store} />
    </TableToolbarSlotProvider>
  )
}
