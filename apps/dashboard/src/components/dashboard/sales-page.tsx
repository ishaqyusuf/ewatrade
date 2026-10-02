import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { OrdersHeader } from "@/components/orders/orders-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { OrderCreateSheet } from "@/components/sheets/order-create-sheet"
import { OrdersDataTable } from "@/components/tables/orders/data-table"
import { OrdersTableSkeleton } from "@/components/tables/orders/skeleton"
import type { TableSettings } from "@/utils/table-settings"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
type StoreSummary = { currencyCode: string; id: string; name: string }

export function SalesPage({
  store,
  initialSettings,
}: {
  store: StoreSummary
  initialSettings?: Partial<TableSettings>
}) {
  return (
    <>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <OrdersHeader storeName={store.name} />
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={
                <OrdersTableSkeleton initialSettings={initialSettings} />
              }
            >
              <OrdersDataTable
                storeId={store.id}
                initialSettings={initialSettings}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </ScrollableContent>
      <OrderCreateSheet store={store} />
    </>
  )
}
