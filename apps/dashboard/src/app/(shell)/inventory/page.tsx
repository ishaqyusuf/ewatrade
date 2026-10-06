import { InventoryPage } from "@/components/dashboard/inventory-page"
import { InventoryTableSkeleton } from "@/components/tables/inventory/skeleton"
import { canOperateInventory } from "@/lib/inventory-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import { getInitialDirectoryView } from "@/utils/directory-views"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Inventory | EwaTrade",
}

export default async function InventoryRoutePage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect("/login?error=no_tenant")
  }

  if (
    !canOperateInventory(ctx.membership.role, ctx.membership.staffAccessMode)
  ) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  const identity = { userId: session.user.id, tenantId: ctx.tenant.id }
  const [initialSettings, initialViewSettings] = await Promise.all([
    getInitialTableSettings("inventory", identity),
    getInitialDirectoryView("inventory", identity),
  ])

  void Promise.allSettled([
    ...(typeof params.catalogDetail === "string" && params.catalogDetail
      ? [
          prefetch(
            trpc.catalog.detail.overview.queryOptions({
              itemId: params.catalogDetail,
              storeId: store.id,
            }),
          ),
        ]
      : []),
    prefetch(
      trpc.inventory.balanceReport.queryOptions({
        includeCompatibleTotals: true,
        storeId: ctx.inventoryScope === "all" ? undefined : store.id,
      }),
    ),
  ])

  return (
    <HydrateClient>
      <Suspense
        fallback={<InventoryTableSkeleton settings={initialSettings} />}
      >
        <InventoryPage
          store={store}
          allStores={ctx.inventoryScope === "all"}
          initialSettings={initialSettings}
          initialViewSettings={initialViewSettings}
        />
      </Suspense>
    </HydrateClient>
  )
}
