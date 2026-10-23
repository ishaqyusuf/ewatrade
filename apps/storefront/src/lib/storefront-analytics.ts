import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import { isQaAnalyticsPrincipal } from "@ewatrade/events/qa-policy-server"
import { createStorefrontAnalyticsHandlers } from "@ewatrade/events/storefront-server"
import { loadFactoryStorefront } from "./storefront-factory"

export const storefrontAnalytics = createStorefrontAnalyticsHandlers({
  resolveMerchant: async (request) => {
    const { load } = await loadFactoryStorefront(
      prisma,
      request.headers.get("host") ?? "",
    )
    if (load.status !== "ready" || load.scope.mode !== "live") return null
    const session = await auth.api.getSession({ headers: request.headers })
    const stored = session
      ? await prisma.session.findUnique({
          where: { id: session.session.id },
          select: { qaAuthorizationId: true },
        })
      : null
    if (
      isQaAnalyticsPrincipal({
        email: session?.user.email,
        qaSession: Boolean(stored?.qaAuthorizationId),
      })
    )
      return null
    return {
      tenantId: load.scope.tenantId,
      name: load.snapshot.resources.business.name,
    }
  },
})
