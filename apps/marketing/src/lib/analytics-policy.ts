import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import { isQaAnalyticsPrincipal } from "@ewatrade/events/qa-policy-server"
import { headers } from "next/headers"
export async function getAnalyticsPolicy() {
  const session = await auth.api.getSession({ headers: await headers() })
  const stored = session
    ? await prisma.session.findUnique({
        where: { id: session.session.id },
        select: { qaAuthorizationId: true },
      })
    : null
  return {
    enabled: !isQaAnalyticsPrincipal({
      email: session?.user.email,
      qaSession: Boolean(stored?.qaAuthorizationId),
    }),
  }
}
