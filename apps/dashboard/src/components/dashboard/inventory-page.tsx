import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { InventoryHeader } from "@/components/inventory/inventory-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { InventoryDataTable } from "@/components/tables/inventory/data-table"
import { InventoryTableSkeleton } from "@/components/tables/inventory/skeleton"
import type { TableSettings } from "@/utils/table-settings"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
type StoreSummary = { currencyCode: string; id: string; name: string }

export function InventoryPage({
  store,
  initialSettings,
}: {
  store: StoreSummary
  initialSettings: TableSettings
}) {
  return (
    <>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <InventoryHeader storeName={store.name} />
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={<InventoryTableSkeleton settings={initialSettings} />}
            >
              <InventoryDataTable
                storeId={store.id}
                initialSettings={initialSettings}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </ScrollableContent>
      <InventoryOperationSheet store={store} />
    </>
  )
}
