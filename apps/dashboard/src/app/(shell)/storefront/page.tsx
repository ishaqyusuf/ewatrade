import { OnlineStore } from "@/components/storefront/manage/online-store"
import { getServerSession } from "@/lib/session"
import { getStorefrontSummary } from "@/lib/storefront-manage"
import { getActiveTenant } from "@/lib/tenant"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { RETAIL_OPS_SUBSCRIPTION_PLANS } from "@ewatrade/db/subscription-plans"
import { isWebsiteDomainsLaunchApproved } from "@ewatrade/db/website-domains-launch-gate"
import { redirect } from "next/navigation"

export const metadata = { title: "Online store | EwaTrade" }

/** Old Studio links (`/storefront?designRun=…`, `?page=…`) keep working. */
const STUDIO_PARAMS = ["designRun", "page", "viewport", "panel", "content"]

/** The Free plan is the one plan without paid features and the one with an online item limit. */
function storefrontItemLimit(planFeatures: readonly string[] | undefined) {
  if (!planFeatures || planFeatures.length > 0) return null
  return (
    RETAIL_OPS_SUBSCRIPTION_PLANS.find((plan) => plan.id === "free")?.limits
      .storefrontItems ?? null
  )
}

export default async function OnlineStorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  if (STUDIO_PARAMS.some((key) => params[key] !== undefined)) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params))
      for (const item of [value].flat())
        if (item !== undefined) query.append(key, item)
    redirect(`/storefront/studio?${query}`)
  }
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/login")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/")
  if (
    !ctx.stores.length ||
    ctx.stores.some(
      (store) => store.businessOnboarding?.setupStatus === "pending",
    )
  )
    redirect("/setup")
  const domainsEnabled = isWebsiteDomainsLaunchApproved()
  const summary = await getStorefrontSummary({
    tenantId: ctx.tenant.id,
    tenantSlug: ctx.tenant.slug,
    storeIds: ctx.stores.map((store) => store.id),
    domainsEnabled,
  })
  return (
    <OnlineStore
      key={ctx.tenant.id}
      businessName={ctx.tenant.name}
      summary={summary}
      itemLimit={storefrontItemLimit(ctx.tenant.planFeatures)}
      domainsEnabled={domainsEnabled}
    />
  )
}
