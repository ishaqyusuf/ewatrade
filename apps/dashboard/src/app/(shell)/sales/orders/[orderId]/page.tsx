import { OrderPage } from "@/components/orders/overview/order-page"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Order | EwaTrade",
}

export default async function OrderRoutePage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  if (!canUseSalesOperations(ctx.membership.role)) redirect("/")
  const store = ctx.activeStore ?? ctx.stores[0] ?? null
  if (!store) redirect("/setup")

  const { orderId } = await params
  // Misses (unknown order, other Store) render in the page, not as a crash.
  await Promise.allSettled([
    prefetch(trpc.orders.get.queryOptions({ orderId })),
    prefetch(trpc.orders.timeline.queryOptions({ orderId })),
    prefetch(trpc.orders.changeOptions.queryOptions({ orderId })),
  ])
  return (
    <HydrateClient>
      <OrderPage key={orderId} orderId={orderId} storeId={store.id} />
    </HydrateClient>
  )
}
