"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { CustomerRequests } from "@/components/service-work/customer-requests"
import { ServiceTabs } from "@/components/service-work/service-tabs"
import { CustomerRequestSheet } from "@/components/sheets/customer-request-sheet"
import { ServiceRequestSheet } from "@/components/sheets/service-request-sheet"
import { ServiceWorkTableSkeleton } from "@/components/tables/service-work/skeleton"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { Button } from "@ewatrade/ui"
import { Link01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }

/** /services/requests: what customers asked for, and your replies. */
export function ServiceRequestsPage({
  store,
  timeZone,
}: {
  store: StoreSummary
  timeZone: string
}) {
  const { setParams } = useServiceWorkParams()
  return (
    <>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <PageHeader
            eyebrow={store.name}
            title="Customer requests"
            description="What customers asked for through your request links."
          >
            <PageToolbar
              actions={
                <Button
                  variant="outline"
                  onClick={() => void setParams({ serviceSheet: "request" })}
                >
                  <HugeiconsIcon
                    icon={Link01Icon}
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                  Request links
                </Button>
              }
            />
            <ServiceTabs />
          </PageHeader>
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense fallback={<ServiceWorkTableSkeleton />}>
              <CustomerRequests storeId={store.id} timeZone={timeZone} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </ScrollableContent>
      <ServiceRequestSheet store={store} />
      <CustomerRequestSheet store={store} timeZone={timeZone} />
    </>
  )
}
