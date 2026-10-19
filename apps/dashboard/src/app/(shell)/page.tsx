import { CollapsibleSummary } from "@/components/collapsible-summary"
import { GettingStarted } from "@/components/dashboard/getting-started"
import { OverviewActions } from "@/components/dashboard/overview-actions"
import { OverviewFab } from "@/components/dashboard/overview-fab"
import {
  OverviewMetrics,
  OverviewMetricsSkeleton,
} from "@/components/dashboard/overview-metrics"
import { OverviewNeedsYou } from "@/components/dashboard/overview-needs-you"
import { OverviewRecentOrders } from "@/components/dashboard/overview-recent-orders"
import {
  OnlineStoreStrip,
  OwnerBusinesses,
} from "@/components/dashboard/owner-signup-home"
import {
  OverviewNumbersError,
  OverviewOrdersError,
} from "@/components/dashboard/workspace-error"
import { PageHeader } from "@/components/page-header"
import { SetupAssistant } from "@/components/setup-assistant/setup-assistant"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { OrderCreateSheet } from "@/components/sheets/order-create-sheet"
import { getGettingStartedActions } from "@/lib/dashboard-overview"
import { canOperateInventory } from "@/lib/inventory-operations"
import {
  canAccessDashboardPath,
  getDashboardNavigation,
} from "@/lib/navigation"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { getDashboardFeatureAvailability } from "@/lib/workspace-feature-availability"
import { prisma } from "@ewatrade/db"
import { resolveOrderScope } from "@ewatrade/db/queries"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Metadata } from "next"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import Link from "next/link"
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
  // Matches the shell's catalog sheet and assistant launcher gating.
  const navigationContext = {
    staffAccessMode: ctx?.membership.staffAccessMode,
    catalogEditor: ctx?.membership.catalogEditor,
  }
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
  const role = ctx?.membership.role ?? ""
  const isOwner = ["OWNER", "ADMIN"].includes(role)
  const timeZone = tenant?.timezone ?? "Africa/Lagos"
  const canAddCatalog = canAccessDashboardPath(
    "/catalog",
    ctx?.membership.role,
    navigationContext,
  )

  // Overview order (workshop direction 02, "Numbers first"): numbers, what
  // needs the owner, recent orders, then setup and the online store link.
  // While there are no orders, setup leads instead.
  const setup = store ? (
    <SetupAssistant
      key="setup"
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
  ) : null
  const numbers =
    availability && store && tenant ? (
      <CollapsibleSummary key="numbers">
        <ErrorBoundary errorComponent={OverviewNumbersError}>
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
    ) : null
  const needsYou =
    store && isOwner ? (
      <OverviewNeedsYou
        key="needs-you"
        storeId={store.id}
        storeName={store.name}
        timeZone={timeZone}
      />
    ) : null
  const recent =
    availability?.hasOrders && store ? (
      <section
        key="recent"
        className="flex min-w-0 flex-col rounded-lg border border-border bg-card"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="font-semibold">
            {["CASHIER", "OPERATOR"].includes(role)
              ? "Your recent orders"
              : "Recent orders"}
          </h2>
          {canAccessDashboardPath(
            "/sales",
            ctx?.membership.role,
            navigationContext,
          ) ? (
            <Link
              href="/sales"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View all
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
            </Link>
          ) : null}
        </div>
        <ErrorBoundary errorComponent={OverviewOrdersError}>
          <Suspense
            fallback={
              <div className="m-4 h-60 animate-pulse rounded-md bg-muted" />
            }
          >
            <OverviewRecentOrders
              storeId={store.id}
              tenantId={tenant?.id ?? ""}
              timeZone={timeZone}
              createdByUserId={scope?.createdByUserId}
            />
          </Suspense>
        </ErrorBoundary>
      </section>
    ) : null
  const storeLink =
    store && tenant && isOwner ? (
      <OnlineStoreStrip
        key={`store:${tenant.id}:${store.id}`}
        tenant={{ id: tenant.id, name: tenant.name, slug: tenant.slug }}
        hasCatalogItems={availability?.hasCatalogItems ?? false}
      />
    ) : null
  const businesses =
    store && tenant && isOwner ? (
      <OwnerBusinesses key={`businesses:${tenant.id}`} />
    ) : null
  const sections = availability?.hasOrders
    ? [numbers, needsYou, recent, setup, storeLink, businesses]
    : [setup, needsYou, storeLink, numbers, businesses]

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 pt-6">
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
          <OverviewActions
            orders={canCreateOrder}
            stock={canUpdateStock}
            catalog={canAddCatalog}
          />
        ) : null}
      </div>
      {sections}
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
      {store ? (
        <OverviewFab
          catalog={canAddCatalog}
          orders={canCreateOrder}
          assistant={getDashboardNavigation(
            ctx?.membership.role,
            navigationContext,
          ).some((item) => item.href === "/assistant")}
        />
      ) : null}
    </div>
  )
}
