import { BusinessNotificationSettingsPage } from "@/components/settings/business-notification-settings-page"
import {
  SettingsHeader,
  SettingsPage,
} from "@/components/settings/settings-page"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { redirect } from "next/navigation"

export const metadata = { title: "Notification settings | EwaTrade" }

export default async function NotificationSettingsPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  // Owner/Admin only; staff manage their own preferences from the inbox.
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/activity")
  return (
    <SettingsPage>
      <SettingsHeader
        title="Notifications"
        description="Choose which alerts are on and who gets them. Alerts never show anyone records they can't already open."
      />
      <BusinessNotificationSettingsPage
        scopeKey={JSON.stringify([
          session.user.id,
          ctx.tenant.id,
          ctx.activeStore?.id ?? null,
        ])}
        stores={ctx.stores.map((store) => ({ id: store.id, name: store.name }))}
      />
    </SettingsPage>
  )
}
