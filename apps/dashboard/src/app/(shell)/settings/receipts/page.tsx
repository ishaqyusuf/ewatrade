import { ReceiptSettingsForm } from "@/components/receipts/settings-form"
import { loadSettingsStoreParams } from "@/hooks/use-settings-store-params"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { redirect } from "next/navigation"

export const metadata = { title: "Receipt settings | EwaTrade" }

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ReceiptSettingsPage({ searchParams }: Props) {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/sales")
  const active = ctx.activeStore ?? ctx.stores[0]
  if (!active) redirect("/setup")
  const params = await loadSettingsStoreParams(searchParams)
  const store =
    ctx.stores.find((option) => option.id === params.storeId) ?? active
  await prefetch(
    trpc.orders.receiptSettings.queryOptions({ storeId: store.id }),
  )
  return (
    <HydrateClient>
      <ReceiptSettingsForm
        activeStoreId={active.id}
        stores={ctx.stores.map((option) => ({
          id: option.id,
          name: option.name,
        }))}
      />
    </HydrateClient>
  )
}
