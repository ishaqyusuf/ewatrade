import { randomUUID } from "node:crypto"
import {
  TEMPLATE_UPDATE_EVENT,
  templateUpdateEmailAllowed,
} from "@ewatrade/notifications/business-events"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { recordBusinessActivityInTransaction } from "./business-activity/record"

export const TEMPLATE_UPDATE_CONSUMER = "storefront_template_update_email"
export type TemplateUpdateTarget = {
  key: string
  version: string
  fromVersions: string[]
}
type Db = PrismaClient | Prisma.TransactionClient
const sourceId = (update: TemplateUpdateTarget) =>
  `${update.key}@${update.version}`

/** Resolve every recipient and release again immediately before dispatch. */
export async function readTemplateUpdateRecipient(
  db: Db,
  input: {
    tenantId: string
    membershipId: string
    siteId: string
    update: TemplateUpdateTarget
  },
) {
  const member = await db.membership.findFirst({
    where: {
      id: input.membershipId,
      tenantId: input.tenantId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
      tenant: { isActive: true, dataClassification: "LIVE" },
      user: { emailVerified: true },
    },
    select: {
      id: true,
      role: true,
      user: { select: { email: true } },
      tenant: { select: { name: true } },
    },
  })
  if (!member) return null
  const site = await db.site.findFirst({
    where: {
      id: input.siteId,
      tenantId: input.tenantId,
      status: "PUBLISHED",
      isPrimary: true,
      store: { tenantId: input.tenantId, status: "ACTIVE" },
      activeRelease: {
        tenantId: input.tenantId,
        siteId: input.siteId,
        templateKey: input.update.key,
        templateVersion: { in: input.update.fromVersions },
      },
    },
    select: {
      id: true,
      storeId: true,
      activeRelease: { select: { templateVersion: true, storeId: true } },
    },
  })
  if (!site?.activeRelease || site.activeRelease.storeId !== site.storeId)
    return null
  const identity = {
    tenantId: input.tenantId,
    membershipId: member.id,
    type: TEMPLATE_UPDATE_EVENT,
  }
  const [policy, subscription, preference] = await Promise.all([
    db.businessNotificationPolicy.findUnique({
      where: {
        tenantId_type: {
          tenantId: input.tenantId,
          type: TEMPLATE_UPDATE_EVENT,
        },
      },
    }),
    db.businessNotificationSubscription.findUnique({
      where: { tenantId_membershipId_type: identity },
      include: { stores: true },
    }),
    db.businessNotificationPreference.findUnique({
      where: { tenantId_membershipId_type: identity },
    }),
  ])
  if (
    !templateUpdateEmailAllowed({
      role: member.role,
      storeId: site.storeId,
      policy,
      subscription,
      preference: preference?.email,
    })
  )
    return null
  return {
    businessName: member.tenant.name,
    recipient: member.user.email,
    site,
    membershipId: member.id,
  }
}

/** Anti-join keeps completed/denied recipients out of subsequent bounded pages. */
export async function enqueueTemplateUpdatePage(
  db: PrismaClient,
  update: TemplateUpdateTarget,
) {
  if (!update.fromVersions.length) return 0
  const candidates = await db.$queryRaw<
    Array<{
      tenantId: string
      membershipId: string
      siteId: string
      storeId: string
      fromVersion: string
    }>
  >(Prisma.sql`
    SELECT DISTINCT ON (m.id) m."tenantId", m.id AS "membershipId", s.id AS "siteId", s."storeId", r."templateVersion" AS "fromVersion"
    FROM "Membership" m JOIN "Tenant" t ON t.id=m."tenantId"
    JOIN "User" u ON u.id=m."userId"
    JOIN "Site" s ON s."tenantId"=t.id AND s."isPrimary"=true AND s.status='PUBLISHED'
    JOIN "Store" st ON st.id=s."storeId" AND st."tenantId"=t.id AND st.status='ACTIVE'
    JOIN "SiteRelease" r ON r.id=s."activeReleaseId" AND r."siteId"=s.id AND r."tenantId"=t.id AND r."storeId"=s."storeId"
    WHERE t."isActive"=true AND t."dataClassification"='LIVE' AND m.status='ACTIVE' AND m.role IN ('OWNER','ADMIN') AND u."emailVerified"=true
      AND r."templateKey"=${update.key} AND r."templateVersion" IN (${Prisma.join(update.fromVersions)})
      AND NOT EXISTS (SELECT 1 FROM "BusinessActivityEvent" e WHERE e."tenantId"=t.id AND e.type=${TEMPLATE_UPDATE_EVENT} AND e."subjectMembershipId"=m.id AND e."sourceKind"='storefront_template_update' AND e."sourceId"=${sourceId(update)})
    ORDER BY m.id,s.id LIMIT 25`)
  for (const candidate of candidates) {
    await db.$transaction(
      async (tx) => {
        // Serialize absent-row discovery as well as retries; keep the first observation time.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["business-notifications", candidate.tenantId, TEMPLATE_UPDATE_EVENT])},0))`
        const existing = await tx.businessActivityEvent.findFirst({
          where: {
            tenantId: candidate.tenantId,
            type: TEMPLATE_UPDATE_EVENT,
            subjectMembershipId: candidate.membershipId,
            sourceKind: "storefront_template_update",
            sourceId: sourceId(update),
          },
          select: { id: true },
        })
        if (existing) return
        const event = await recordBusinessActivityInTransaction(tx, {
          tenantId: candidate.tenantId,
          storeId: candidate.storeId,
          type: TEMPLATE_UPDATE_EVENT,
          actor: { kind: "system" },
          source: {
            kind: "storefront_template_update",
            id: sourceId(update),
            action: candidate.membershipId,
          },
          subjectMembershipId: candidate.membershipId,
          occurredAt: new Date().toISOString(),
          payload: {
            siteId: candidate.siteId,
            templateKey: update.key,
            fromVersion: candidate.fromVersion,
            toVersion: update.version,
          },
        })
        if (event.replay) return
        // This event has its own email consumer; it does not activate generic inbox fanout.
        await tx.businessActivityOutbox.updateMany({
          where: {
            tenantId: candidate.tenantId,
            eventId: event.id,
            consumer: "in_app",
            status: "PENDING",
          },
          data: { status: "COMPLETED", completedAt: new Date() },
        })
        await tx.businessActivityOutbox.create({
          data: {
            tenantId: candidate.tenantId,
            eventId: event.id,
            consumer: TEMPLATE_UPDATE_CONSUMER,
          },
        })
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  }
  return candidates.length
}

export async function listTemplateUpdateEmails(
  db: PrismaClient,
  now = new Date(),
) {
  // An expired provider-bound lease has an unknown outcome. Never blindly resend.
  await db.businessActivityOutbox.updateMany({
    where: {
      consumer: TEMPLATE_UPDATE_CONSUMER,
      status: "CLAIMED",
      claimExpiresAt: { lte: now },
      failureCode: "DISPATCH_STARTED",
    },
    data: {
      status: "FAILED",
      failureCode: "EMAIL_OUTCOME_UNKNOWN",
      claimId: null,
      claimExpiresAt: null,
    },
  })
  await db.businessActivityOutbox.updateMany({
    where: {
      consumer: TEMPLATE_UPDATE_CONSUMER,
      status: { in: ["PENDING", "CLAIMED"] },
      attemptCount: { gte: 3 },
      OR: [{ status: "PENDING" }, { claimExpiresAt: { lte: now } }],
    },
    data: {
      status: "FAILED",
      failureCode: "EMAIL_PREPARATION_FAILED",
      claimId: null,
      claimExpiresAt: null,
    },
  })
  return db.businessActivityOutbox.findMany({
    where: {
      consumer: TEMPLATE_UPDATE_CONSUMER,
      attemptCount: { lt: 3 },
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        { status: "CLAIMED", claimExpiresAt: { lte: now } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: 25,
    select: {
      id: true,
      tenantId: true,
      event: {
        select: { type: true, subjectMembershipId: true, payload: true },
      },
    },
  })
}

export async function claimTemplateUpdateEmail(
  db: PrismaClient,
  id: string,
  tenantId: string,
  now = new Date(),
) {
  const claimId = randomUUID()
  const claimed = await db.businessActivityOutbox.updateMany({
    where: {
      id,
      tenantId,
      consumer: TEMPLATE_UPDATE_CONSUMER,
      attemptCount: { lt: 3 },
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        {
          status: "CLAIMED",
          claimExpiresAt: { lte: now },
          OR: [
            { failureCode: null },
            { failureCode: { not: "DISPATCH_STARTED" } },
          ],
        },
      ],
    },
    data: {
      status: "CLAIMED",
      claimId,
      claimExpiresAt: new Date(now.getTime() + 300_000),
      attemptCount: { increment: 1 },
      failureCode: null,
    },
  })
  return claimed.count
    ? {
        id,
        tenantId,
        consumer: TEMPLATE_UPDATE_CONSUMER,
        status: "CLAIMED" as const,
        claimId,
      }
    : null
}

/** Commit current authority and dispatch intent together; never hold a DB lock over network I/O. */
export async function startTemplateUpdateEmail(
  db: PrismaClient,
  claim: NonNullable<Awaited<ReturnType<typeof claimTemplateUpdateEmail>>>,
  input: Parameters<typeof readTemplateUpdateRecipient>[1] & {
    recipient: string
  },
) {
  if (input.tenantId !== claim.tenantId) return false
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["business-notifications", input.tenantId, TEMPLATE_UPDATE_EVENT])},0))`
      await tx.$queryRaw`SELECT m.id FROM "Membership" m JOIN "Tenant" t ON t.id=m."tenantId"
      JOIN "Site" s ON s."tenantId"=t.id JOIN "Store" st ON st.id=s."storeId" AND st."tenantId"=t.id
      WHERE m.id=${input.membershipId} AND t.id=${input.tenantId} AND s.id=${input.siteId} FOR SHARE OF m,t,s,st`
      const current = await readTemplateUpdateRecipient(tx, input)
      if (current?.recipient !== input.recipient) return false
      const changed = await tx.businessActivityOutbox.updateMany({
        where: { ...claim, claimExpiresAt: { gt: new Date() } },
        data: { failureCode: "DISPATCH_STARTED" },
      })
      return changed.count === 1
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** Personal preference only, never a capability carried in an email URL. */
export async function setTemplateUpdateEmailPreference(
  db: PrismaClient,
  input: { tenantId: string; userId: string; enabled: boolean },
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["business-notifications", input.tenantId, TEMPLATE_UPDATE_EVENT])},0))`
      await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${input.tenantId} AND "userId"=${input.userId} FOR SHARE`
      const member = await tx.membership.findFirst({
        where: {
          tenantId: input.tenantId,
          userId: input.userId,
          status: "ACTIVE",
          role: { in: ["OWNER", "ADMIN"] },
          tenant: { isActive: true },
        },
        select: { id: true },
      })
      if (!member)
        throw Error("Current business management access is required.")
      const identity = {
        tenantId: input.tenantId,
        membershipId: member.id,
        type: TEMPLATE_UPDATE_EVENT,
      }
      return tx.businessNotificationPreference.upsert({
        where: { tenantId_membershipId_type: identity },
        create: { ...identity, email: input.enabled ? "on" : "off" },
        update: { email: input.enabled ? "on" : "off" },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
