import { DomainsDirectory } from "@/components/domains/domains-directory"
import { getServerSession } from "@/lib/session"
import { storefrontUrl } from "@/lib/storefront-url"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { isWebsiteDomainsLaunchApproved } from "@ewatrade/db/website-domains-launch-gate"
import { redirect } from "next/navigation"

export const metadata = { title: "Domains | EwaTrade" }

export default async function DomainsSettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")
  // Only Owners and Admins connect or buy web addresses (the API checks too).
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/settings")
  if (!isWebsiteDomainsLaunchApproved()) redirect("/settings")
  if (!(ctx.activeStore ?? ctx.stores[0])) redirect("/setup")

  // The registrant profile loads with the Buy sheet, not the page.
  prefetch(trpc.domains.list.queryOptions({}))

  return (
    <HydrateClient>
      <DomainsDirectory freeAddress={storefrontUrl(ctx.tenant.slug)} />
    </HydrateClient>
  )
}
