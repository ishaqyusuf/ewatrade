import { RetailOpsSubscriptionSettings } from "@/components/dashboard/retail-ops-subscription-settings"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"

export default async function SettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null

  return (
    <RetailOpsSubscriptionSettings
      settingsContext={
        session && ctx
          ? {
              activeStore: ctx.activeStore,
              membershipRole: ctx.membership.role,
              stores: ctx.stores,
              tenant: ctx.tenant,
              user: session.user,
            }
          : null
      }
    />
  )
}
