"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import {
  type InventoryPageAccess,
  InventoryPageHeader,
  inventoryHistoryViewOptions,
} from "@/components/inventory/inventory-header"
import {
  InventoryLedgerFilters,
  InventoryLedgerSearch,
} from "@/components/inventory/inventory-ledger-filters"
import { NewTransferButton } from "@/components/inventory/new-transfer-button"
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
import { useMobileOverlay } from "@/hooks/use-mobile-overlay"
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
  storePicker,
  showShipments,
}: InventoryPageAccess & {
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
  // Transfers have no grid; a saved Grid choice shows as List. Phones always
  // get the list (the view menu is hidden there).
  const phone = useMobileOverlay()
  const shownView = phone || view === "cards" ? "list" : view
  return (
    <TableToolbarSlotProvider>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-4 pt-4 pb-8">
          <InventoryPageHeader
            storePicker={storePicker}
            showShipments={showShipments}
            search={
              <InventoryLedgerSearch placeholder="Search product or store" />
            }
            actions={
              <>
                <div className="flex items-center gap-2 max-md:hidden">
                  <TableToolbarSlot />
                  <ViewDropdown
                    label="Transfers view"
                    value={shownView}
                    options={inventoryHistoryViewOptions}
                    onValueChange={setView}
                  />
                </div>
                <NewTransferButton />
              </>
            }
          >
            <InventoryLedgerFilters
              label="Transfer status"
              filters={transferFilters(!allStores)}
            />
          </InventoryPageHeader>
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
