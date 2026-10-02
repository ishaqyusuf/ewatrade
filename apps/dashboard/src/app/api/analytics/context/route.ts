import { getAnalyticsPolicy } from "@/lib/analytics-policy"
import { issueAnalyticsContext } from "@ewatrade/events/identity-server"

export async function GET() {
  const { session, tenant, enabled } = await getAnalyticsPolicy()
  const context =
    enabled && session
      ? issueAnalyticsContext({
          project: "ewatrade-dashboard",
          userId: session.user.id,
          tenantId: tenant?.tenant.id,
          tenantName: tenant?.tenant.name,
          role: tenant?.membership.role,
          internal: session.user.isPlatformAdmin,
        })
      : null
  return Response.json(
    { enabled, context },
    {
      headers: { "cache-control": "private, no-store" },
    },
  )
}
