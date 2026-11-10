import { ShipmentsPage } from "@/components/shipments/shipments-page"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = { title: "Shipments | EwaTrade" }

export default async function Page() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  // Shipments post bills and stock cost, so they share Finance's owner/admin gate.
  if (!["OWNER", "ADMIN"].includes(ctx.membership.role.toUpperCase()))
    redirect("/inventory")
  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")
  prefetch(trpc.finance.book.queryOptions())
  return (
    <HydrateClient>
      <ShipmentsPage store={store} />
    </HydrateClient>
  )
}
