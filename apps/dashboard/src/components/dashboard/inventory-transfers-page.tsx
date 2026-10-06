import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { NewTransferButton } from "@/components/inventory/new-transfer-button"
import { PageHeader } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { TransfersDataTable } from "@/components/tables/stock-transfers/data-table"
import { TransfersSkeleton } from "@/components/tables/stock-transfers/skeleton"
import type { TableSettings } from "@/utils/table-settings"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
export function InventoryTransfersPage({
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
              title="Stock transfers"
              description="Track stock moving between your stores."
            />
            <NewTransferButton />
          </div>
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={<TransfersSkeleton settings={initialSettings} />}
            >
              <TransfersDataTable
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
