import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import { isQaAnalyticsPrincipal } from "@ewatrade/events/qa-policy-server"
import { headers } from "next/headers"
import { getServerSession } from "./session"
import { getActiveTenant } from "./tenant"

export async function getAnalyticsPolicy() {
  const [session, rawSession] = await Promise.all([
    getServerSession(),
    auth.api.getSession({ headers: await headers() }),
  ])
  const tenant = session ? await getActiveTenant(session.user.id) : null
  const [storedSession, workspace] = rawSession
    ? await Promise.all([
        prisma.session.findUnique({
          where: { id: rawSession.session.id },
          select: { qaAuthorizationId: true },
        }),
        tenant
          ? prisma.tenant.findUnique({
              where: { id: tenant.tenant.id },
              select: { dataClassification: true },
            })
          : null,
      ])
    : [null, null]
  return {
    session,
    tenant,
    enabled: !isQaAnalyticsPrincipal({
      email: rawSession?.user.email,
      qaSession: Boolean(storedSession?.qaAuthorizationId),
      dataClassification: workspace?.dataClassification,
    }),
  }
}
