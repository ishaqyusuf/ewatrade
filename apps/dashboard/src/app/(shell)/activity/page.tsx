import { ActivityPage } from "@/components/dashboard/activity-page"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Activity | EwaTrade",
}

export default async function ActivityRoutePage() {
  const session = await getServerSession()
  if (!session) redirect("/login")

  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")

  // Operational roles only; the server re-derives row, count and filter-choice
  // scope from current Store/domain access on every read. Reads are not
  // prefetched: each client mount owns a fresh, scope-isolated request.
  if (!canUseSalesOperations(ctx.membership.role)) redirect("/")

  return (
    <ActivityPage
      timeZone={ctx.tenant.timezone}
      viewerMembershipId={ctx.membership.id}
      scopeKey={JSON.stringify([
        session.user.id,
        ctx.tenant.id,
        ctx.activeStore?.id ?? null,
      ])}
    />
  )
}
