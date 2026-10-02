import { CollapsibleSummary } from "@/components/collapsible-summary"
import { GettingStarted } from "@/components/dashboard/getting-started"
import {
  OverviewMetrics,
  OverviewMetricsSkeleton,
} from "@/components/dashboard/overview-metrics"
import { OverviewRecentOrders } from "@/components/dashboard/overview-recent-orders"
import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PageHeader } from "@/components/page-header"
import { getGettingStartedActions } from "@/lib/dashboard-overview"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { getDashboardFeatureAvailability } from "@/lib/workspace-feature-availability"
import type { Metadata } from "next"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"

export const metadata: Metadata = { title: "Overview | EwaTrade" }

export default async function DashboardHomePage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  const store = ctx?.activeStore
  const tenant = ctx?.tenant
  const availability =
    store && tenant
      ? await getDashboardFeatureAvailability(store.id, tenant.id)
      : null
  const actions =
    availability && !availability.hasOrders
      ? getGettingStartedActions(ctx?.membership.role, availability)
      : []
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
      <PageHeader
        title="Overview"
        description={
          store && tenant
            ? `${tenant.name} · ${store.name}`
            : "Your business at a glance"
        }
      />
      {actions.length > 0 && store ? (
        <GettingStarted
          actions={actions}
          store={{
            businessProfileKey:
              store.businessOnboarding?.businessProfileKey ?? null,
            id: store.id,
            currencyCode: store.currencyCode,
          }}
        />
      ) : null}
      {availability && store && tenant ? (
        <CollapsibleSummary>
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={<OverviewMetricsSkeleton availability={availability} />}
            >
              <OverviewMetrics
                availability={availability}
                store={store}
                tenantId={tenant.id}
              />
            </Suspense>
          </ErrorBoundary>
        </CollapsibleSummary>
      ) : null}
      {availability?.hasOrders && store ? (
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <h2 className="text-sm font-semibold">Recent orders</h2>
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={<div className="h-64 animate-pulse bg-muted" />}
            >
              <OverviewRecentOrders storeId={store.id} />
            </Suspense>
          </ErrorBoundary>
        </section>
      ) : null}
    </div>
  )
}
