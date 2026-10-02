import { SalesPage } from "@/components/dashboard/sales-page"
import { OrdersTableSkeleton } from "@/components/tables/orders/skeleton"
import {
  getTableSort,
  loadSortParams,
  orderSortFields,
} from "@/hooks/sort-params"
import {
  getOrderListPageInput,
  loadOrderFilterParams,
} from "@/hooks/use-order-filter-params"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, prefetch, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Orders | EwaTrade",
}

export default async function SalesRoutePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect("/login?error=no_tenant")
  }

  if (!canUseSalesOperations(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  const params = await searchParams
  const [filter, sortParams, initialSettings] = await Promise.all([
    loadOrderFilterParams(params),
    loadSortParams(params),
    getInitialTableSettings("orders", {
      userId: session.user.id,
      tenantId: ctx.tenant.id,
    }),
  ])
  const sort = getTableSort(sortParams.sort, orderSortFields)
  const queryClient = getQueryClient()
  void Promise.allSettled([
    ...(params.orderSheet === "create"
      ? [prefetch(trpc.catalog.listItems.queryOptions({}))]
      : []),
    queryClient.prefetchInfiniteQuery(
      trpc.orders.listPage.infiniteQueryOptions(
        { ...getOrderListPageInput(filter), sort, storeId: store.id },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
          retry: false,
        },
      ),
    ),
  ])

  return (
    <HydrateClient>
      <Suspense
        fallback={<OrdersTableSkeleton initialSettings={initialSettings} />}
      >
        <SalesPage store={store} initialSettings={initialSettings} />
      </Suspense>
    </HydrateClient>
  )
}
