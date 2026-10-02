import { SettingsNavigation } from "@/components/settings/settings-navigation"
import { getDashboardNavigation } from "@/lib/navigation"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  const store = ctx?.activeStore ?? ctx?.stores[0]
  const items =
    getDashboardNavigation(ctx?.membership.role, {
      businessProfileKey: store?.businessOnboarding?.businessProfileKey,
      operatingModel: store?.businessOnboarding?.operatingModel,
    }).find((item) => item.href === "/settings")?.children ?? []
  return (
    <div className="w-full min-w-0 max-w-[800px]">
      <SettingsNavigation items={items} />
      <div className="mt-8">{children}</div>
    </div>
  )
}
