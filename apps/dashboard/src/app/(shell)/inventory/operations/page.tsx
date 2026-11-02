import { InventoryOperationsPage } from "@/components/dashboard/inventory-operations-page"
import { OperationsSkeleton } from "@/components/tables/inventory-operations/skeleton"
import { loadStockHistoryCategoryFilter } from "@/hooks/use-stock-history-filter-params"
import { stockHistoryPageInput } from "@/lib/inventory-labels"
import { canOperateInventory } from "@/lib/inventory-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import { getInitialDirectoryView } from "@/utils/directory-views"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
export const metadata: Metadata = { title: "Stock history | EwaTrade" }
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
    getInitialTableSettings("inventory-operations", identity),
    getInitialDirectoryView("inventory-operations", identity),
  ])
  const params = await searchParams
  const categories = await loadStockHistoryCategoryFilter(params)
  void getQueryClient().prefetchInfiniteQuery(
    trpc.inventory.operationHistoryPage.infiniteQueryOptions(
      stockHistoryPageInput({
        storeId: ctx.inventoryScope === "all" ? undefined : store.id,
        q: firstParam(params.q),
        filter: firstParam(params.filter),
        categories,
      }),
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  return (
    <HydrateClient>
      <Suspense fallback={<OperationsSkeleton settings={initialSettings} />}>
        <InventoryOperationsPage
          store={store}
          allStores={ctx.inventoryScope === "all"}
          initialSettings={initialSettings}
          initialViewSettings={initialViewSettings}
        />
      </Suspense>
    </HydrateClient>
  )
}
