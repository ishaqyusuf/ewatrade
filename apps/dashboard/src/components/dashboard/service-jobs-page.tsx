import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { ScrollableContent } from "@/components/scrollable-content"
import { CustomerRequests } from "@/components/service-work/customer-requests"
import { ServiceWorkHeader } from "@/components/service-work/service-work-header"
import { ServiceIntakeSheet } from "@/components/sheets/service-intake-sheet"
import { ServiceJobSheet } from "@/components/sheets/service-job-sheet"
import { ServiceQuoteSheet } from "@/components/sheets/service-quote-sheet"
import { ServiceRequestSheet } from "@/components/sheets/service-request-sheet"
import { ServiceSettingsSheet } from "@/components/sheets/service-settings-sheet"
import { ServiceWorkDataTable } from "@/components/tables/service-work/data-table"
import { ServiceWorkTableSkeleton } from "@/components/tables/service-work/skeleton"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"

import type { TableSettings } from "@/utils/table-settings"

type StoreSummary = {
  currencyCode: string
  id: string
  name: string
}

export function ServiceJobsPage({
  canManage,
  store,
  timeZone,
  initialSettings,
}: {
  canManage: boolean
  store: StoreSummary
  timeZone: string
  initialSettings?: Partial<TableSettings>
}) {
  return (
    <>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <ServiceWorkHeader canManage={canManage} storeName={store.name} />
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={
                <ServiceWorkTableSkeleton
                  initialSettings={initialSettings}
                  canManage={canManage}
                />
              }
            >
              <ServiceWorkDataTable
                initialSettings={initialSettings}
                canManage={canManage}
                storeId={store.id}
                timeZone={timeZone}
              />
            </Suspense>
          </ErrorBoundary>
          {canManage ? (
            <ErrorBoundary errorComponent={WorkspaceError}>
              <Suspense fallback={<ServiceWorkTableSkeleton />}>
                <CustomerRequests storeId={store.id} />
              </Suspense>
            </ErrorBoundary>
          ) : null}
        </div>
      </ScrollableContent>
      <ServiceIntakeSheet canManage={canManage} store={store} />
      {canManage ? (
        <>
          <ServiceRequestSheet store={store} />
          <ServiceQuoteSheet store={store} />
          <ServiceSettingsSheet
            currencyCode={store.currencyCode}
            storeId={store.id}
          />
        </>
      ) : null}
      <ServiceJobSheet canManage={canManage} storeId={store.id} />
    </>
  )
}
