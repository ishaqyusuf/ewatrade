"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { OrdersHeader } from "@/components/orders/orders-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { OrderCreateSheet } from "@/components/sheets/order-create-sheet"
import { OrderDetailsSheet } from "@/components/sheets/order-details-sheet"
import { OrdersDataTable } from "@/components/tables/orders/data-table"
import { OrdersTableSkeleton } from "@/components/tables/orders/skeleton"
import { useDirectoryView } from "@/hooks/use-directory-view"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
type StoreSummary = { currencyCode: string; id: string; name: string }

export function SalesPage({
  store,
  initialSettings,
  initialViewSettings,
  customerDirectory = true,
}: {
  store: StoreSummary
  initialSettings?: Partial<TableSettings>
  initialViewSettings: DirectoryViewSettings
  customerDirectory?: boolean
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "orders",
      queryKey: "orderView",
      initialSettings: initialViewSettings,
    })
  return (
    <>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <OrdersHeader
            storeName={store.name}
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
                <OrdersTableSkeleton
                  initialSettings={initialSettings}
                  view={view}
                />
              }
            >
              <OrdersDataTable
                key={store.id}
                storeId={store.id}
                initialSettings={initialSettings}
                view={view}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </ScrollableContent>
      <OrderCreateSheet store={store} customerDirectory={customerDirectory} />
      <OrderDetailsSheet key={store.id} storeId={store.id} />
    </>
  )
}
