import { SettingsNavigation } from "@/components/settings/settings-navigation"
import { getDashboardNavigation } from "@/lib/navigation"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import {
  getRetailOpsTenantPlan,
  isWebsiteDomainsLaunchApproved,
} from "@ewatrade/db/queries"

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
      websiteDomainsEnabled: isWebsiteDomainsLaunchApproved(),
    }).find((item) => item.href === "/settings")?.children ?? []
  return (
    <div className="grid w-full min-w-0 gap-6 pt-2 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8 md:pt-6 lg:grid-cols-[196px_minmax(0,720px)] lg:gap-10">
      <SettingsNavigation items={items} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
