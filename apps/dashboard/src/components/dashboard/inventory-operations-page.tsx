"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { inventoryHistoryViewOptions } from "@/components/inventory/inventory-header"
import { InventoryLedgerFilters } from "@/components/inventory/inventory-ledger-filters"
import { InventoryOperationMenu } from "@/components/inventory/inventory-operation-menu"
import { InventoryTabs } from "@/components/inventory/inventory-tabs"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import {
  TableToolbarSlot,
  TableToolbarSlotProvider,
} from "@/components/tables/core"
import { OperationsDataTable } from "@/components/tables/inventory-operations/data-table"
import { OperationsSkeleton } from "@/components/tables/inventory-operations/skeleton"
import { ViewDropdown } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { stockChangeGroups } from "@/lib/inventory-labels"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
export function InventoryOperationsPage({
  store,
  initialSettings,
  initialViewSettings,
  allStores = false,
}: {
  store: { id: string; name: string; currencyCode: string }
  allStores?: boolean
  initialSettings: TableSettings
  initialViewSettings: DirectoryViewSettings
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "inventory-operations",
      queryKey: "operationView",
      initialSettings: initialViewSettings,
    })
  // History has no grid; a saved Grid choice shows as List.
  const shownView = view === "cards" ? "list" : view
  return (
    <TableToolbarSlotProvider>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <PageHeader
            eyebrow={allStores ? "All stores" : store.name}
            title="Stock history"
            description="Every change to your stock, newest first."
          >
            <PageToolbar
              actions={
                <>
                  <TableToolbarSlot />
                  <ViewDropdown
                    label="Stock history view"
                    value={shownView}
                    options={inventoryHistoryViewOptions}
                    onValueChange={setView}
                  />
                  <InventoryOperationMenu />
                </>
              }
            >
              <InventoryLedgerFilters
                placeholder="Search reason, note or store"
                filters={stockChangeGroups}
              />
            </PageToolbar>
            <InventoryTabs />
          </PageHeader>
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
                <OperationsSkeleton
                  settings={initialSettings}
                  view={shownView}
                />
              }
            >
              <OperationsDataTable
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
