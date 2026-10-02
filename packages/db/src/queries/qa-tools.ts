import { configuredQaDomains } from "@ewatrade/utils/qa-accelerator"
import type { DbClient } from "./types"

type QaToolsSession = {
  createdAt: Date
  expiresAt: Date
  user: { id: string; email: string; emailVerified: boolean }
}
type QaToolsMembership = {
  status: string
  tenant: {
    id: string
    currencyCode: string
    timezone: string
    isActive: boolean
    dataClassification: string
    qaPurgeStartedAt: Date | null
    qaSourceDomain: string | null
    stores: Array<{ id: string; status: string }>
  }
}

// Draft tooling does not grant account switching, membership or provider access.
export function resolveAuthenticatedQaFixtureContext(input: {
  enabled: boolean
  domainRoutes: string | undefined
  membership: QaToolsMembership | null
  now: Date
  session: QaToolsSession | null
  storeId: string | null
}) {
  const { membership, now, session, storeId } = input
  if (
    !input.enabled ||
    !session ||
    !session.user.emailVerified ||
    session.expiresAt <= now ||
    !membership ||
    membership.status !== "ACTIVE"
  )
    return null

  const email = session.user.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  const domain = email.slice(email.indexOf("@") + 1)
  const tenant = membership.tenant
  if (
    !domain.endsWith(".test") ||
    !configuredQaDomains(input.domainRoutes).has(domain) ||
    !tenant.isActive ||
    tenant.dataClassification !== "QA" ||
    tenant.qaPurgeStartedAt ||
    tenant.qaSourceDomain !== domain ||
    !storeId ||
    !tenant.stores.some(
      (store) => store.id === storeId && store.status === "ACTIVE",
    )
  )
    return null

  return {
    currencyCode: tenant.currencyCode,
    expiresAt: new Date(
      Math.min(session.expiresAt.getTime(), now.getTime() + 60_000),
    ),
    principalId: session.user.id,
    qaDomain: domain,
    seed: session.createdAt.getTime().toString(),
    storeId,
    tenantId: tenant.id,
    testerIdentity: session.user.id,
    timezone: tenant.timezone,
  }
}

export async function getAuthenticatedQaFixtureContext(
  db: DbClient,
  input: {
    membershipId: string
    sessionId: string
    storeId: string | null
    tenantId: string
    userId: string
  },
  env = process.env,
) {
  if (env.QA_TOOLS_ENABLED !== "true") return null
  const [session, membership] = await Promise.all([
    db.session.findFirst({
      where: { id: input.sessionId, userId: input.userId },
      select: {
        createdAt: true,
        expiresAt: true,
        user: { select: { id: true, email: true, emailVerified: true } },
      },
    }),
    db.membership.findFirst({
      where: {
        id: input.membershipId,
        tenantId: input.tenantId,
        userId: input.userId,
      },
      select: {
        status: true,
        tenant: {
          select: {
            id: true,
            currencyCode: true,
            timezone: true,
            isActive: true,
            dataClassification: true,
            qaPurgeStartedAt: true,
            qaSourceDomain: true,
            stores: {
              where: { id: input.storeId ?? "" },
              select: { id: true, status: true },
            },
          },
        },
      },
    }),
  ])
  return resolveAuthenticatedQaFixtureContext({
    enabled: true,
    domainRoutes: env.EMAIL_QA_DOMAIN_ROUTES,
    membership,
    now: new Date(),
    session,
    storeId: input.storeId,
  })
}
