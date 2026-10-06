import { InventoryOperationsPage } from "@/components/dashboard/inventory-operations-page"
import { OperationsSkeleton } from "@/components/tables/inventory-operations/skeleton"
import { canOperateInventory } from "@/lib/inventory-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
export const metadata: Metadata = { title: "Operations | EwaTrade" }
export default async function Page() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  if (!canOperateInventory(ctx.membership.role, ctx.membership.staffAccessMode)) redirect("/")
  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")
  const initialSettings = await getInitialTableSettings(
    "inventory-operations",
    { userId: session.user.id, tenantId: ctx.tenant.id },
  )
  prefetch(
    trpc.inventory.operationHistory.queryOptions({
      storeId: ctx.inventoryScope === "all" ? undefined : store.id,
      limit: 200,
    }),
  )
  return (
    <HydrateClient>
      <Suspense fallback={<OperationsSkeleton settings={initialSettings} />}>
        <InventoryOperationsPage
          store={store}
          allStores={ctx.inventoryScope === "all"}
          initialSettings={initialSettings}
        />
      </Suspense>
    </HydrateClient>
  )
}
