import { CollapsibleSummary } from "@/components/collapsible-summary"
import { GettingStarted } from "@/components/dashboard/getting-started"
import { OverviewActions } from "@/components/dashboard/overview-actions"
import {
  OverviewMetrics,
  OverviewMetricsSkeleton,
} from "@/components/dashboard/overview-metrics"
import { OverviewRecentOrders } from "@/components/dashboard/overview-recent-orders"
import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PageHeader } from "@/components/page-header"
import { AssistantProductEntry } from "@/components/product-assistant/assistant-home"
import { SetupAssistant } from "@/components/setup-assistant/setup-assistant"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { OrderCreateSheet } from "@/components/sheets/order-create-sheet"
import { OrderDetailsSheet } from "@/components/sheets/order-details-sheet"
import { OrderVisibilityCard } from "@/components/staff/order-visibility-card"
import { getGettingStartedActions } from "@/lib/dashboard-overview"
import { canOperateInventory } from "@/lib/inventory-operations"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { getDashboardFeatureAvailability } from "@/lib/workspace-feature-availability"
import { prisma } from "@ewatrade/db"
import { resolveOrderScope } from "@ewatrade/db/queries"
import type { Metadata } from "next"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"

export const metadata: Metadata = { title: "Overview | EwaTrade" }

export default async function DashboardHomePage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  const store = ctx?.activeStore
  const tenant = ctx?.tenant
  const scope =
    ctx && session && store
      ? await resolveOrderScope(prisma, {
          role: ctx.membership.role,
          userId: session.user.id,
          tenantId: ctx.tenant.id,
          storeId: store.id,
          allowedStoreIds: ctx.stores.map((row) => row.id),
        })
      : undefined
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
      {store && ["OWNER", "ADMIN"].includes(ctx?.membership.role ?? "") ? (
        <OrderVisibilityCard storeId={store.id} storeName={store.name} review />
      ) : null}
      {store ? (
        <SetupAssistant
          hasCatalogItems={availability?.hasCatalogItems ?? false}
          offerSetup={actions.length > 0}
          fallback={
            actions.length === 0 ? null : (
              <GettingStarted
                actions={actions}
                store={{
                  businessProfileKey:
                    store.businessOnboarding?.businessProfileKey ?? null,
                  id: store.id,
                  currencyCode: store.currencyCode,
                }}
              />
            )
          }
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
                createdByUserId={scope?.createdByUserId}
              />
            </Suspense>
          </ErrorBoundary>
        </CollapsibleSummary>
      ) : null}
      {availability?.hasOrders && store ? (
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {["CASHIER", "OPERATOR"].includes(ctx?.membership.role ?? "")
              ? "Your sales"
              : "Recent orders"}
          </h2>
          <ErrorBoundary errorComponent={WorkspaceError}>
            <Suspense
              fallback={<div className="h-64 animate-pulse bg-muted" />}
            >
              <OverviewRecentOrders
                storeId={store.id}
                tenantId={tenant?.id ?? ""}
                createdByUserId={scope?.createdByUserId}
              />
            </Suspense>
          </ErrorBoundary>
        </section>
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
