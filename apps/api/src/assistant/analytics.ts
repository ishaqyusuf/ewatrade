import {
  type DashboardPrincipal,
  dashboardCaptureAllowed,
} from "@ewatrade/events/server-dashboard"

/** Session-derived only; never accept a principal or consent grant from a body. */
export function assistantAnalyticsContext(ctx: {
  requestHeaders: Headers
  session: {
    user: { id: string; email: string; isPlatformAdmin?: boolean | null }
  }
  tenantContext: {
    tenant: { id: string; name: string; dataClassification: string }
    membership: { role: string }
  }
  qaSessionScope?: unknown
}) {
  const principal: DashboardPrincipal = {
    userId: ctx.session.user.id,
    email: ctx.session.user.email,
    internal: ctx.session.user.isPlatformAdmin === true,
    tenantId: ctx.tenantContext.tenant.id,
    tenantName: ctx.tenantContext.tenant.name,
    dataClassification: ctx.tenantContext.tenant.dataClassification,
    role: ctx.tenantContext.membership.role,
    qaSession: Boolean(ctx.qaSessionScope),
  }
  let origin: string | undefined
  try {
    if (dashboardCaptureAllowed(ctx.requestHeaders, principal))
      origin = ctx.requestHeaders.get("origin") ?? undefined
  } catch {
    /* Collection fails closed without changing the operation. */
  }
  return { principal, origin }
}
