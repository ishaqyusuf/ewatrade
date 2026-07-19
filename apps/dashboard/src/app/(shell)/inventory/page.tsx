import { InventoryPage } from "@/components/dashboard/inventory-page"
import { InventoryTableSkeleton } from "@/components/tables/inventory/skeleton"
import { canOperateInventory } from "@/lib/inventory-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export const metadata: Metadata = {
  title: "Inventory | EwaTrade",
}

export default async function InventoryRoutePage() {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  if (!canOperateInventory(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  await Promise.allSettled([
    prefetch(
      trpc.inventory.balanceReport.queryOptions({
        includeCompatibleTotals: true,
        storeId: store.id,
      }),
    ),
    prefetch(
      trpc.inventory.operationHistory.queryOptions({
        limit: 50,
        storeId: store.id,
      }),
    ),
    prefetch(
      trpc.inventory.transfers.queryOptions({
        limit: 100,
        storeId: store.id,
      }),
    ),
  ])

  return (
    <HydrateClient>
      <Suspense fallback={<InventoryTableSkeleton />}>
        <InventoryPage store={store} />
      </Suspense>
    </HydrateClient>
  )
}
