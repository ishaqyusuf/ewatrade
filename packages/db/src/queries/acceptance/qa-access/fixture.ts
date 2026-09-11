import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { configuredQaDomains } from "@ewatrade/utils/qa-accelerator"
import type { PrismaClient } from "../../../../generated/prisma/client"
import {
  MembershipRole,
  MembershipStatus,
  QaDataClassification,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../../../../generated/prisma/enums"

type FixtureBusinessInput = {
  classification: QaDataClassification
  domain: string
  name: string
  role: MembershipRole
  suffix: string
}

export type QaAccessAcceptanceFixture = {
  auditClientDigests: Set<string>
  attemptBucketDigests: Set<string>
  db: PrismaClient
  domain: string
  fixtureId: string
  grantIds: Set<string>
  secret: string
  tenantIds: string[]
  userIds: string[]
}

export type QaAccessAcceptanceResidue = {
  auditEvents: number
  authorizations: number
  grants: number
  memberships: number
  profileSelections: number
  sessions: number
  stores: number
  tenants: number
  throttleBuckets: number
  users: number
}

function fixtureDigest(secret: string, purpose: string, value: string) {
  return createHmac("sha256", secret)
    .update(`${purpose}:${value}`)
    .digest("hex")
}

async function createFixtureBusiness(
  fixture: QaAccessAcceptanceFixture,
  input: FixtureBusinessInput,
) {
  const user = await fixture.db.user.create({
    data: {
      email: `qa-acceptance-${input.suffix}-${fixture.fixtureId}@${fixture.domain}`,
      emailVerified: true,
      name: `${input.name} Tester`,
    },
  })
  fixture.userIds.push(user.id)

  const tenant = await fixture.db.tenant.create({
    data: {
      dataClassification: input.classification,
      enabledModes: [TenantMode.MERCHANT],
      name: input.name,
      qaMarkedAt:
        input.classification === QaDataClassification.QA ? new Date() : null,
      qaSourceDomain: input.domain,
      slug: `qa-acceptance-${input.suffix}-${fixture.fixtureId}`,
      type: TenantType.MERCHANT,
      users: {
        create: {
          acceptedAt: new Date(),
          role: input.role,
          status: MembershipStatus.ACTIVE,
          userId: user.id,
        },
      },
      stores: {
        create: {
          countryCode: "NG",
          name: `${input.name} Store`,
          slug: `qa-acceptance-${input.suffix}`,
          status: StoreStatus.ACTIVE,
          supportEmail: `store-${input.suffix}-${fixture.fixtureId}@${fixture.domain}`,
        },
      },
    },
  })
  fixture.tenantIds.push(tenant.id)
  return tenant
}

export async function createQaAccessAcceptanceFixture(input?: {
  secret?: string
}): Promise<QaAccessAcceptanceFixture> {
  if (!process.env.EWATRADE_DATABASE_URL) {
    throw new Error(
      "EWATRADE_DATABASE_URL is required for QA access integration tests.",
    )
  }

  const domains = [
    ...configuredQaDomains(process.env.EMAIL_QA_DOMAIN_ROUTES),
  ].sort()
  const domain = domains[0]
  if (!domain) {
    throw new Error(
      "At least one routed EMAIL_QA_DOMAIN_ROUTES domain is required.",
    )
  }

  const db = (await import("../../../client")).prisma
  const fixture: QaAccessAcceptanceFixture = {
    auditClientDigests: new Set(),
    attemptBucketDigests: new Set(),
    db,
    domain,
    fixtureId: randomUUID(),
    grantIds: new Set(),
    secret: input?.secret ?? randomBytes(48).toString("base64url"),
    tenantIds: [],
    userIds: [],
  }

  try {
    const alpha = await createFixtureBusiness(fixture, {
      classification: QaDataClassification.QA,
      domain,
      name: "QA Acceptance Alpha",
      role: MembershipRole.OWNER,
      suffix: "alpha",
    })
    await createFixtureBusiness(fixture, {
      classification: QaDataClassification.QA,
      domain,
      name: "QA Acceptance Beta",
      role: MembershipRole.MANAGER,
      suffix: "beta",
    })
    await createFixtureBusiness(fixture, {
      classification: QaDataClassification.QA,
      domain: `cross-${fixture.fixtureId}.qa.test`,
      name: "QA Acceptance Cross Domain",
      role: MembershipRole.OWNER,
      suffix: "cross-domain",
    })
    await createFixtureBusiness(fixture, {
      classification: QaDataClassification.LIVE,
      domain,
      name: "QA Acceptance Live",
      role: MembershipRole.OWNER,
      suffix: "live",
    })

    const invitedUser = await db.user.create({
      data: {
        email: `qa-acceptance-invited-${fixture.fixtureId}@${domain}`,
        emailVerified: false,
        name: "QA Acceptance Invited",
      },
    })
    fixture.userIds.push(invitedUser.id)
    await db.membership.create({
      data: {
        invitedAt: new Date(),
        role: MembershipRole.MEMBER,
        status: MembershipStatus.INVITED,
        tenantId: alpha.id,
        userId: invitedUser.id,
      },
    })
    await db.store.create({
      data: {
        countryCode: "NG",
        name: "QA Acceptance Archived Store",
        slug: "qa-acceptance-archived",
        status: StoreStatus.ARCHIVED,
        tenantId: alpha.id,
      },
    })
    await db.store.create({
      data: {
        countryCode: "NG",
        name: "QA Acceptance Second Active Store",
        slug: "qa-acceptance-second-active",
        status: StoreStatus.ACTIVE,
        tenantId: alpha.id,
      },
    })

    return fixture
  } catch (error) {
    await disposeQaAccessAcceptanceFixture(fixture)
    throw error
  }
}

export function trackQaAccessExchangeClient(
  fixture: QaAccessAcceptanceFixture,
  input: { clientId: string; domain?: string },
) {
  const domain = input.domain ?? fixture.domain
  fixture.attemptBucketDigests.add(
    fixtureDigest(
      fixture.secret,
      "exchange-attempt-client",
      `${domain}|${input.clientId}`,
    ),
  )
  fixture.auditClientDigests.add(
    fixtureDigest(
      fixture.secret,
      "audit-client",
      fixtureDigest(fixture.secret, "client-identity", input.clientId),
    ).slice(0, 24),
  )
}

export async function disposeQaAccessAcceptanceFixture(
  fixture: QaAccessAcceptanceFixture,
): Promise<QaAccessAcceptanceResidue> {
  const grantIds = [...fixture.grantIds]
  const authorizationIds = (
    await fixture.db.qaClientAuthorization.findMany({
      select: { id: true },
      where: { grantId: { in: grantIds } },
    })
  ).map((authorization) => authorization.id)
  const auditIds = (
    await fixture.db.qaAccessAuditEvent.findMany({
      select: { id: true },
      where: {
        OR: [
          { grantId: { in: grantIds } },
          { authorizationId: { in: authorizationIds } },
          { clientDigest: { in: [...fixture.auditClientDigests] } },
        ],
      },
    })
  ).map((event) => event.id)

  await fixture.db.$transaction(
    [
      fixture.db.session.deleteMany({
        where: {
          OR: [
            { qaAuthorizationId: { in: authorizationIds } },
            { userId: { in: fixture.userIds } },
          ],
        },
      }),
      fixture.db.qaAccessAuditEvent.deleteMany({
        where: { id: { in: auditIds } },
      }),
      fixture.db.qaTesterGrant.deleteMany({
        where: { id: { in: grantIds } },
      }),
      fixture.db.qaAccessAttemptBucket.deleteMany({
        where: { bucketDigest: { in: [...fixture.attemptBucketDigests] } },
      }),
      fixture.db.tenant.deleteMany({
        where: { id: { in: fixture.tenantIds } },
      }),
      fixture.db.user.deleteMany({
        where: {
          id: { in: fixture.userIds },
          memberships: { none: {} },
        },
      }),
    ],
    { timeout: 60_000 },
  )

  const [
    auditEvents,
    authorizations,
    grants,
    memberships,
    profileSelections,
    sessions,
    stores,
    tenants,
    throttleBuckets,
    users,
  ] = await Promise.all([
    fixture.db.qaAccessAuditEvent.count({ where: { id: { in: auditIds } } }),
    fixture.db.qaClientAuthorization.count({
      where: { id: { in: authorizationIds } },
    }),
    fixture.db.qaTesterGrant.count({ where: { id: { in: grantIds } } }),
    fixture.db.membership.count({
      where: { tenantId: { in: fixture.tenantIds } },
    }),
    fixture.db.qaAccessProfileSelection.count({
      where: { authorizationId: { in: authorizationIds } },
    }),
    fixture.db.session.count({ where: { userId: { in: fixture.userIds } } }),
    fixture.db.store.count({ where: { tenantId: { in: fixture.tenantIds } } }),
    fixture.db.tenant.count({ where: { id: { in: fixture.tenantIds } } }),
    fixture.db.qaAccessAttemptBucket.count({
      where: { bucketDigest: { in: [...fixture.attemptBucketDigests] } },
    }),
    fixture.db.user.count({ where: { id: { in: fixture.userIds } } }),
  ])

  return {
    auditEvents,
    authorizations,
    grants,
    memberships,
    profileSelections,
    sessions,
    stores,
    tenants,
    throttleBuckets,
    users,
  }
}
