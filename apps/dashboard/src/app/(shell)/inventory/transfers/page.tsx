import { InventoryTransfersPage } from "@/components/dashboard/inventory-transfers-page"
import { TransfersSkeleton } from "@/components/tables/stock-transfers/skeleton"
import { transfersPageInput } from "@/lib/inventory-labels"
import { canOperateInventory } from "@/lib/inventory-operations"
import { inventoryPageAccess } from "@/lib/inventory-page-access"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import { getInitialDirectoryView } from "@/utils/directory-views"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
export const metadata: Metadata = { title: "Transfers | EwaTrade" }
const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
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
  const params = await searchParams
  void getQueryClient().prefetchInfiniteQuery(
    trpc.inventory.transfersPage.infiniteQueryOptions(
      transfersPageInput({
        storeId: ctx.inventoryScope === "all" ? undefined : store.id,
        q: firstParam(params.q),
        filter: firstParam(params.filter),
      }),
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  return (
    <HydrateClient>
      <Suspense fallback={<TransfersSkeleton settings={initialSettings} />}>
        <InventoryTransfersPage
          {...inventoryPageAccess(ctx)}
          store={store}
          allStores={ctx.inventoryScope === "all"}
          initialSettings={initialSettings}
          initialViewSettings={initialViewSettings}
        />
      </Suspense>
    </HydrateClient>
  )
}
