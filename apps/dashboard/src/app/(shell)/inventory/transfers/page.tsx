import { InventoryTransfersPage } from "@/components/dashboard/inventory-transfers-page"
import { TransfersSkeleton } from "@/components/tables/stock-transfers/skeleton"
import { canOperateInventory } from "@/lib/inventory-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import { getInitialDirectoryView } from "@/utils/directory-views"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
export const metadata: Metadata = { title: "Stock transfers | EwaTrade" }
export default async function Page() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  if (!canOperateInventory(ctx.membership.role, ctx.membership.staffAccessMode))
    redirect("/")
  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")
  const identity = { userId: session.user.id, tenantId: ctx.tenant.id }
  const [initialSettings, initialViewSettings] = await Promise.all([
    getInitialTableSettings("stock-transfers", identity),
    getInitialDirectoryView("stock-transfers", identity),
  ])
  prefetch(
    trpc.inventory.transfers.queryOptions({
      storeId: ctx.inventoryScope === "all" ? undefined : store.id,
      limit: 200,
    }),
  )
  return (
    <HydrateClient>
      <Suspense fallback={<TransfersSkeleton settings={initialSettings} />}>
        <InventoryTransfersPage
          store={store}
          allStores={ctx.inventoryScope === "all"}
          initialSettings={initialSettings}
          initialViewSettings={initialViewSettings}
        />
      </Suspense>
    </HydrateClient>
  )
}
