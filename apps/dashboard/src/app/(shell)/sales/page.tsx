import { SalesPage } from "@/components/dashboard/sales-page"
import { OrdersTableSkeleton } from "@/components/tables/orders/skeleton"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export const metadata: Metadata = {
  title: "Orders | EwaTrade",
}

export default async function SalesRoutePage() {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  if (!canUseSalesOperations(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  await Promise.allSettled([
    prefetch(trpc.catalog.listItems.queryOptions({})),
    prefetch(trpc.orders.list.queryOptions({ limit: 100, storeId: store.id })),
  ])

  return (
    <HydrateClient>
      <Suspense fallback={<OrdersTableSkeleton />}>
        <SalesPage store={store} />
      </Suspense>
    </HydrateClient>
  )
}
