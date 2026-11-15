import { SettingsNavigation } from "@/components/settings/settings-navigation"
import { getDashboardNavigation } from "@/lib/navigation"
import { getDashboardPlanFeatures } from "@/lib/plan-features"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { isWebsiteDomainsLaunchApproved } from "@ewatrade/db/website-domains-launch-gate"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  const store = ctx?.activeStore ?? ctx?.stores[0]
  // Same features the shell gated the sidebar with: joined into the workspace
  // read, so Settings adds no plan query of its own.
  const planFeatures = ctx ? await getDashboardPlanFeatures(ctx.tenant) : null
  const items =
    getDashboardNavigation(ctx?.membership.role, {
      businessProfileKey: store?.businessOnboarding?.businessProfileKey,
      operatingModel: store?.businessOnboarding?.operatingModel,
      planFeatures: planFeatures ?? undefined,
      websiteDomainsEnabled: isWebsiteDomainsLaunchApproved(),
    }).find((item) => item.href === "/settings")?.children ?? []
  return (
    <div
      className="grid w-full min-w-0 gap-5 pt-2 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8 md:pt-6 lg:grid-cols-[224px_minmax(0,720px)] lg:gap-10"
      // Whether the plan gates above came from a known plan, or were left open.
      data-billing-plan-read={
        planFeatures === null
          ? undefined
          : planFeatures
            ? "resolved"
            : "unavailable"
      }
    >
      <SettingsNavigation items={items} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
