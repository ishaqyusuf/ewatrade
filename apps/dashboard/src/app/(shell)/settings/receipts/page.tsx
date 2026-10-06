import { PageHeader } from "@/components/page-header"
import { ReceiptSettingsForm } from "@/components/receipts/settings-form"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { redirect } from "next/navigation"

export const metadata = { title: "Receipt settings | EwaTrade" }
export default async function ReceiptSettingsPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/sales")
  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")
  void prefetch(trpc.orders.receiptSettings.queryOptions({ storeId: store.id }))
  return (
    <HydrateClient>
      <div className="grid gap-6">
        <PageHeader
          title="Receipt settings"
          eyebrow={ctx.tenant.name}
          description="Save your receipt defaults once. Orders use them automatically."
        />
        <ReceiptSettingsForm storeId={store.id} />
      </div>
    </HydrateClient>
  )
}
