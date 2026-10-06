"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { NewTransferButton } from "@/components/inventory/new-transfer-button"
import { PageHeader } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { TransfersDataTable } from "@/components/tables/stock-transfers/data-table"
import { TransfersSkeleton } from "@/components/tables/stock-transfers/skeleton"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
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
  return (
    <>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <PageHeader
              eyebrow={allStores ? "All stores" : store.name}
              title="Stock transfers"
              description="Track stock moving between your stores."
            />
            <div className="flex flex-wrap items-center gap-2">
              <ViewSwitcher
                label="Stock transfer view"
                value={view}
                options={directoryViewOptions}
                onValueChange={setView}
              />
              <NewTransferButton />
            </div>
          </div>
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
                <TransfersSkeleton settings={initialSettings} view={view} />
              }
            >
              <TransfersDataTable
                storeId={allStores ? undefined : store.id}
                initialSettings={initialSettings}
                view={view}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </ScrollableContent>
      <InventoryOperationSheet store={store} />
    </>
  )
}
