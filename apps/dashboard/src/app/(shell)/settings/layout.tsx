import { SettingsNavigation } from "@/components/settings/settings-navigation"
import { getDashboardNavigation } from "@/lib/navigation"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { getRetailOpsTenantPlan } from "@ewatrade/db/queries"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  const store = ctx?.activeStore ?? ctx?.stores[0]
  const planFeatures = ctx
    ? await getRetailOpsTenantPlan(prisma, { tenantId: ctx.tenant.id }).then(
        ({ plan }) => plan.features,
        () => undefined,
      )
    : undefined
  const items =
    getDashboardNavigation(ctx?.membership.role, {
      businessProfileKey: store?.businessOnboarding?.businessProfileKey,
      operatingModel: store?.businessOnboarding?.operatingModel,
      planFeatures,
    }).find((item) => item.href === "/settings")?.children ?? []
  return (
    <div className="w-full min-w-0 max-w-[800px]">
      <SettingsNavigation items={items} />
      <div className="mt-8">{children}</div>
    </div>
  )
}
