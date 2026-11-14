import { OverviewActions } from "@/components/dashboard/overview-actions"
import {
  OverviewContent,
  OverviewTodayHeading,
} from "@/components/dashboard/overview-content"
import { OverviewFab } from "@/components/dashboard/overview-fab"
import { OverviewMetricsSkeleton } from "@/components/dashboard/overview-metrics"
import { OverviewSheets } from "@/components/dashboard/overview-sheets"
import { canOperateInventory } from "@/lib/inventory-operations"
import {
  canAccessDashboardPath,
  getDashboardNavigation,
} from "@/lib/navigation"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { RETAIL_OPS_SUBSCRIPTION_PLANS } from "@ewatrade/db/subscription-plans"
import type { Metadata } from "next"
import { Suspense } from "react"

export const metadata: Metadata = { title: "Overview | EwaTrade" }

/** The Free plan is the one plan without paid features and the one with an online item limit. */
function storefrontItemLimit(planFeatures: readonly string[] | undefined) {
  if (!planFeatures || planFeatures.length > 0) return null
  return (
    RETAIL_OPS_SUBSCRIPTION_PLANS.find((plan) => plan.id === "free")?.limits
      .storefrontItems ?? null
  )
}

export default async function DashboardHomePage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  const store = ctx?.activeStore
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
  const canAddCatalog = canAccessDashboardPath(
    "/catalog",
    ctx?.membership.role,
    navigationContext,
  )
  const hasActions = Boolean(
    store && (canCreateOrder || canUpdateStock || canAddCatalog),
  )

  // The top bar holds the page title; the store picker and business switcher
  // already name the business, so the page repeats neither.
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 pt-6 pb-24 sm:gap-6">
      {ctx && store ? (
        // Streams before any private read. Phones show it only for the
        // "Today" heading; the + button carries the actions there.
        <div className="hidden min-w-0 items-end justify-between gap-4 has-[[data-overview-today]]:flex sm:flex">
          <Suspense fallback={<span />}>
            <OverviewTodayHeading
              role={ctx.membership.role}
              storeId={store.id}
              tenantId={ctx.tenant.id}
              timeZone={ctx.tenant.timezone ?? "Africa/Lagos"}
            />
          </Suspense>
          {hasActions ? (
            <OverviewActions
              orders={canCreateOrder}
              stock={canUpdateStock}
              catalog={canAddCatalog}
            />
          ) : null}
        </div>
      ) : null}
      {ctx && session ? (
        <Suspense fallback={<OverviewMetricsSkeleton />}>
          <OverviewContent
            allowedStoreIds={ctx.stores.map((row) => row.id)}
            membership={{
              role: ctx.membership.role,
              staffAccessMode: ctx.membership.staffAccessMode,
              catalogEditor: ctx.membership.catalogEditor,
            }}
            store={ctx.activeStore}
            tenant={{
              id: ctx.tenant.id,
              name: ctx.tenant.name,
              slug: ctx.tenant.slug,
              timezone: ctx.tenant.timezone,
              storefrontItemLimit: storefrontItemLimit(ctx.tenant.planFeatures),
            }}
            userId={session.user.id}
          />
        </Suspense>
      ) : null}
      {store ? (
        <OverviewSheets
          key={store.id}
          store={store}
          orders={canCreateOrder}
          inventory={canUpdateStock}
          customerDirectory={customerDirectory}
        />
      ) : null}
      {store ? (
        <OverviewFab
          catalog={canAddCatalog}
          orders={canCreateOrder}
          stock={canUpdateStock}
          assistant={getDashboardNavigation(
            ctx?.membership.role,
            navigationContext,
          ).some((item) => item.href === "/assistant")}
        />
      ) : null}
    </div>
  )
}
