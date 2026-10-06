import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { InventoryOperationMenu } from "@/components/inventory/inventory-operation-menu"
import { PageHeader } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { OperationsDataTable } from "@/components/tables/inventory-operations/data-table"
import { OperationsSkeleton } from "@/components/tables/inventory-operations/skeleton"
import type { TableSettings } from "@/utils/table-settings"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
export function InventoryOperationsPage({
  store,
  initialSettings,
  allStores = false,
}: {
  store: { id: string; name: string; currencyCode: string }
  allStores?: boolean
  initialSettings: TableSettings
}) {
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
            <InventoryOperationMenu />
          </div>
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={<OperationsSkeleton settings={initialSettings} />}
            >
              <OperationsDataTable
                storeId={allStores ? undefined : store.id}
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
