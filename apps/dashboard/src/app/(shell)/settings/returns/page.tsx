import { ReturnRefundPolicyForm } from "@/components/orders/overview/order-change-approvals"
import { PageHeader } from "@/components/page-header"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { redirect } from "next/navigation"

export const metadata = { title: "Returns and refunds | EwaTrade" }
export default async function ReturnRefundSettingsPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/sales")
  if (!(ctx.activeStore ?? ctx.stores[0])) redirect("/setup")
  void prefetch(trpc.orders.changePolicy.queryOptions())
  return (
    <HydrateClient>
      <div className="grid gap-6">
        <PageHeader
          title="Returns and refunds"
          eyebrow={ctx.tenant.name}
          description="Choose, per store, whether staff can return items and give refunds, must ask an owner or admin first, or not at all."
        />
        <ReturnRefundPolicyForm />
      </div>
    </HydrateClient>
  )
}
