import { SettingsNavigation } from "@/components/settings/settings-navigation"
import { getDashboardNavigation } from "@/lib/navigation"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { getRetailOpsTenantPlan } from "@ewatrade/db/retail-ops-subscriptions"
import { isWebsiteDomainsLaunchApproved } from "@ewatrade/db/website-domains-launch-gate"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  const store = ctx?.activeStore ?? ctx?.stores[0]
  const planRead = ctx
    ? await getRetailOpsTenantPlan(prisma, { tenantId: ctx.tenant.id }).then(
        ({ plan, subscription }) => ({
          status: "resolved" as const,
          plan,
          source: subscription.source,
        }),
        () => ({ status: "unavailable" as const }),
      )
    : undefined
  const planFeatures =
    planRead?.status === "resolved" ? planRead.plan.features : undefined
  const items =
    getDashboardNavigation(ctx?.membership.role, {
      businessProfileKey: store?.businessOnboarding?.businessProfileKey,
      operatingModel: store?.businessOnboarding?.operatingModel,
      planFeatures,
      websiteDomainsEnabled: isWebsiteDomainsLaunchApproved(),
    }).find((item) => item.href === "/settings")?.children ?? []
  return (
    <div
      className="grid w-full min-w-0 gap-6 pt-2 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8 md:pt-6 lg:grid-cols-[196px_minmax(0,720px)] lg:gap-10"
      // Distinguish this server read from client plan cards and ungated fallback.
      data-billing-plan-read={planRead?.status}
      data-billing-plan-id={
        planRead?.status === "resolved" ? planRead.plan.id : undefined
      }
      data-billing-plan-source={
        planRead?.status === "resolved" ? planRead.source : undefined
      }
    >
      <SettingsNavigation items={items} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
