import { OverviewActions } from "@/components/dashboard/overview-actions"
import { OverviewContent } from "@/components/dashboard/overview-content"
import { OverviewFab } from "@/components/dashboard/overview-fab"
import { OverviewMetricsSkeleton } from "@/components/dashboard/overview-metrics"
import { OverviewSheets } from "@/components/dashboard/overview-sheets"
import { PageHeader } from "@/components/page-header"
import { canOperateInventory } from "@/lib/inventory-operations"
import {
  canAccessDashboardPath,
  getDashboardNavigation,
} from "@/lib/navigation"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import type { Metadata } from "next"
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
          assistant={getDashboardNavigation(
            ctx?.membership.role,
            navigationContext,
          ).some((item) => item.href === "/assistant")}
        />
      ) : null}
    </div>
  )
}
