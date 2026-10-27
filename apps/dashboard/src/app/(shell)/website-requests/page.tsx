import { StorefrontRequestsInbox } from "@/components/storefront-requests/storefront-requests-inbox"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

export const metadata = { title: "Website requests | EwaTrade" }

/** Requests customers send from the storefront; the API rechecks role and Store scope. */
export default async function Page() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const tenant = await getActiveTenant(session.user.id)
  if (!tenant || !canUseSalesOperations(tenant.membership.role)) redirect("/")
  return <StorefrontRequestsInbox timeZone={tenant.tenant.timezone} />
}
