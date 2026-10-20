"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { InventoryOperationMenu } from "@/components/inventory/inventory-operation-menu"
import { PageHeader } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { OperationsDataTable } from "@/components/tables/inventory-operations/data-table"
import { OperationsSkeleton } from "@/components/tables/inventory-operations/skeleton"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
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
  return (
    <>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <PageHeader
              eyebrow={allStores ? "All stores" : store.name}
              title="Operations"
              description="Review stock changes and their recorded movements."
            />
            <div className="flex flex-wrap items-center gap-2">
              <ViewSwitcher
                label="Operation view"
                value={view}
                options={directoryViewOptions}
                onValueChange={setView}
              />
              <InventoryOperationMenu />
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
                <OperationsSkeleton settings={initialSettings} view={view} />
              }
            >
              <OperationsDataTable
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
