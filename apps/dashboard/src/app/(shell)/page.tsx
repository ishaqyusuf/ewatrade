import { CollapsibleSummary } from "@/components/collapsible-summary"
import { GettingStarted } from "@/components/dashboard/getting-started"
import { OverviewActions } from "@/components/dashboard/overview-actions"
import {
  OverviewMetrics,
  OverviewMetricsSkeleton,
} from "@/components/dashboard/overview-metrics"
import {
  OverviewRecentOrders,
  OverviewRecentOrdersSkeleton,
} from "@/components/dashboard/overview-recent-orders"
import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PageHeader } from "@/components/page-header"
import { AssistantProductEntry } from "@/components/product-assistant/assistant-home"
import { SetupAssistant } from "@/components/setup-assistant/setup-assistant"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { OrderCreateSheet } from "@/components/sheets/order-create-sheet"
import { OrderDetailsSheet } from "@/components/sheets/order-details-sheet"
import { getGettingStartedActions } from "@/lib/dashboard-overview"
import { canOperateInventory } from "@/lib/inventory-operations"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { getDashboardFeatureAvailability } from "@/lib/workspace-feature-availability"
import { cn } from "@/utils"
import type { Metadata } from "next"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"

export const metadata: Metadata = { title: "Overview | EwaTrade" }

export default async function DashboardHomePage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  const store = ctx?.activeStore
  const tenant = ctx?.tenant
  const canCreateOrder = canUseSalesOperations(ctx?.membership.role)
  const canUpdateStock = canOperateInventory(
    ctx?.membership.role,
    ctx?.membership.staffAccessMode,
  )
  const customerDirectory =
    ctx?.membership.staffAccessMode !== "SCOPED" ||
    ["OWNER", "ADMIN"].includes(ctx?.membership.role ?? "")
  const availability =
    store && tenant
      ? await getDashboardFeatureAvailability(store.id, tenant.id)
      : null
  const actions =
    availability && !availability.hasOrders
      ? getGettingStartedActions(
          ctx?.membership.role,
          availability,
          ctx?.membership,
        )
      : []
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <PageHeader
          title="Overview"
          description={
            store && tenant
              ? `${tenant.name} · ${store.name}`
              : "Your business at a glance"
          }
        />
        {store ? (
          <div className="flex flex-wrap gap-2">
            <AssistantProductEntry label="Add products with AI" />
            <OverviewActions orders={canCreateOrder} stock={canUpdateStock} />
          </div>
        ) : null}
      </div>
      {store ? (
        // The setup checklist now lives in the overview grid below; the
        // assistant keeps its banner and modal here.
        <SetupAssistant
          hasCatalogItems={availability?.hasCatalogItems ?? false}
          offerSetup={actions.length > 0}
          fallback={null}
        />
      ) : null}
      {availability && store && tenant ? (
        <CollapsibleSummary>
          <div
            className={cn(
              "grid min-w-0 items-start gap-4 lg:gap-5",
              (availability.hasOrders || actions.length > 0) &&
                "lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]",
            )}
          >
            <ErrorBoundary errorComponent={WorkspaceError}>
              <Suspense
                fallback={
                  <OverviewMetricsSkeleton availability={availability} />
                }
              >
                <OverviewMetrics
                  availability={availability}
                  store={store}
                  tenantId={tenant.id}
                  actions={{ orders: canCreateOrder, stock: canUpdateStock }}
                />
              </Suspense>
            </ErrorBoundary>
            {availability.hasOrders ? (
              <ErrorBoundary errorComponent={WorkspaceError}>
                <Suspense fallback={<OverviewRecentOrdersSkeleton />}>
                  <OverviewRecentOrders
                    storeId={store.id}
                    viewAll={canCreateOrder}
                  />
                </Suspense>
              </ErrorBoundary>
            ) : actions.length > 0 ? (
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
          </div>
        </CollapsibleSummary>
      ) : null}
      {store && canCreateOrder ? (
        <OrderCreateSheet
          key={`order:${store.id}`}
          store={store}
          customerDirectory={customerDirectory}
        />
      ) : null}
      {store && canUpdateStock ? (
        <InventoryOperationSheet key={`stock:${store.id}`} store={store} />
      ) : null}
      {store && canCreateOrder ? (
        <OrderDetailsSheet key={`details:${store.id}`} storeId={store.id} />
      ) : null}
    </div>
  )
}
