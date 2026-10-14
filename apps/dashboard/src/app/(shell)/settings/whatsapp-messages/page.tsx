import { CustomerMessageTemplateList } from "@/components/customer-messages/template-list"
import { PageHeader } from "@/components/page-header"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { redirect } from "next/navigation"

export const metadata = { title: "WhatsApp messages | EwaTrade" }
export default async function WhatsAppMessageSettingsPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/sales")
  if (!(ctx.activeStore ?? ctx.stores[0])) redirect("/setup")
  void prefetch(trpc.customerMessages.templates.list.queryOptions())
  return (
    <HydrateClient>
      <div className="grid gap-6">
        <PageHeader
          title="WhatsApp messages"
          eyebrow={ctx.tenant.name}
          description="Save the wording once. On each order, staff check it, then send it from their own WhatsApp."
        />
        <CustomerMessageTemplateList />
      </div>
    </HydrateClient>
  )
}
