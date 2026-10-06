"use client"

import { ScrollableContent } from "@/components/scrollable-content"
import { PrescriptionDataTable } from "@/components/tables/prescriptions/data-table"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PrescriptionTableSkeleton } from "@/components/tables/prescriptions/skeleton"
import { useDirectoryView } from "@/hooks/use-directory-view"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
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
  initialViewSettings,
}: {
  canManageSetup: boolean
  store: { id: string; name: string }
  timeZone: string
  initialSettings?: Partial<TableSettings>
  initialViewSettings: DirectoryViewSettings
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "prescriptions",
      queryKey: "prescriptionView",
      initialSettings: initialViewSettings,
    })
  return (
    <PrescriptionWorkspaceGate canManageSetup={canManageSetup} store={store}>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <PrescriptionHeader
            canManageSetup={canManageSetup}
            storeId={store.id}
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
                <PrescriptionTableSkeleton
                  initialSettings={initialSettings}
                  view={view}
                />
              }
            >
              <PrescriptionDataTable
                storeId={store.id}
                timeZone={timeZone}
                initialSettings={initialSettings}
                view={view}
              />
            </Suspense>
          </ErrorBoundary>
          <PrescriptionFulfillmentPanel storeId={store.id} />
        </div>
      </ScrollableContent>
    </PrescriptionWorkspaceGate>
  )
}
