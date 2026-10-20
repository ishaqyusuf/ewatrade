import { CustomerMessageTemplateList } from "@/components/customer-messages/template-list"
import { templateListInput } from "@/components/customer-messages/template-model"
import { SettingsPage } from "@/components/settings/settings-page"
import { loadSettingsStoreParams } from "@/hooks/use-settings-store-params"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"

export const metadata = { title: "WhatsApp messages | EwaTrade" }
export default async function WhatsAppMessageSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/sales")
  if (!(ctx.activeStore ?? ctx.stores[0])) redirect("/setup")
  const stores = ctx.stores.map((store) => ({ id: store.id, name: store.name }))
  const { storeId } = await loadSettingsStoreParams(searchParams)
  // No Store (or one this person can't reach) shows the business messages.
  const selected = stores.find((store) => store.id === storeId)?.id
  await prefetch(
    trpc.customerMessages.templates.list.queryOptions(
      templateListInput(selected),
    ),
  )
  return (
    <HydrateClient>
      <SettingsPage>
        <CustomerMessageTemplateList stores={stores} />
      </SettingsPage>
    </HydrateClient>
  )
}
