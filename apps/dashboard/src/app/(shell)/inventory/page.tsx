import { InventoryPage } from "@/components/dashboard/inventory-page"
import { getDashboardInventory } from "@/lib/inventory-data"
import { canOperateInventory } from "@/lib/inventory-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

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

  const { inventory, movements } = await getDashboardInventory({
    storeId: store.id,
    tenantId: ctx.tenant.id,
  })

  return (
    <InventoryPage
      initialInventory={inventory}
      initialMovements={movements}
      store={store}
    />
  )
}
