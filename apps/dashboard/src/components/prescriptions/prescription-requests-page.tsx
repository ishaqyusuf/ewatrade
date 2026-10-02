import { ScrollableContent } from "@/components/scrollable-content"
import { PrescriptionDataTable } from "@/components/tables/prescriptions/data-table"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PrescriptionTableSkeleton } from "@/components/tables/prescriptions/skeleton"
import type { TableSettings } from "@/utils/table-settings"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
import { PrescriptionFulfillmentPanel } from "./prescription-fulfillment-panel"
import { PrescriptionHeader } from "./prescription-header"
import { PrescriptionWorkspaceGate } from "./prescription-workspace-gate"

export function PrescriptionRequestsPage({
  canManageSetup,
  store,
  timeZone,
  initialSettings,
}: {
  canManageSetup: boolean
  store: { id: string; name: string }
  timeZone: string
  initialSettings?: Partial<TableSettings>
}) {
  return (
    <PrescriptionWorkspaceGate canManageSetup={canManageSetup} store={store}>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <PrescriptionHeader
            canManageSetup={canManageSetup}
            storeId={store.id}
            storeName={store.name}
          />
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={
                <PrescriptionTableSkeleton initialSettings={initialSettings} />
              }
            >
              <PrescriptionDataTable
                storeId={store.id}
                timeZone={timeZone}
                initialSettings={initialSettings}
              />
            </Suspense>
          </ErrorBoundary>
          <PrescriptionFulfillmentPanel storeId={store.id} />
        </div>
      </ScrollableContent>
    </PrescriptionWorkspaceGate>
  )
}
