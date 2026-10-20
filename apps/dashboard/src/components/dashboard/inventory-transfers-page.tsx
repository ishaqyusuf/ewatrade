"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { inventoryHistoryViewOptions } from "@/components/inventory/inventory-header"
import { InventoryLedgerFilters } from "@/components/inventory/inventory-ledger-filters"
import { InventoryTabs } from "@/components/inventory/inventory-tabs"
import { NewTransferButton } from "@/components/inventory/new-transfer-button"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import {
  TableToolbarSlot,
  TableToolbarSlotProvider,
} from "@/components/tables/core"
import {
  TransfersDataTable,
  transferFilters,
} from "@/components/tables/stock-transfers/data-table"
import { TransfersSkeleton } from "@/components/tables/stock-transfers/skeleton"
import { ViewDropdown } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
export function InventoryTransfersPage({
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
      pageId: "stock-transfers",
      queryKey: "transferView",
      initialSettings: initialViewSettings,
    })
  // Transfers have no grid; a saved Grid choice shows as List.
  const shownView = view === "cards" ? "list" : view
  return (
    <TableToolbarSlotProvider>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <PageHeader
            eyebrow={allStores ? "All stores" : store.name}
            title="Transfers"
            description="Stock moving between your stores. It leaves one store when sent and arrives when received."
          >
            <PageToolbar
              actions={
                <>
                  <TableToolbarSlot />
                  <ViewDropdown
                    label="Transfers view"
                    value={shownView}
                    options={inventoryHistoryViewOptions}
                    onValueChange={setView}
                  />
                  <NewTransferButton />
                </>
              }
            >
              <InventoryLedgerFilters
                placeholder="Search product or store"
                filters={transferFilters(!allStores)}
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
                <TransfersSkeleton
                  settings={initialSettings}
                  view={shownView}
                />
              }
            >
              <TransfersDataTable
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
