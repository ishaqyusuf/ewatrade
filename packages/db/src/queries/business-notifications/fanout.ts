import { randomUUID } from "node:crypto"
import { z } from "zod"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { BusinessActivityError } from "../business-activity/errors"
import {
  RetailOpsSubscriptionError,
  assertRetailOpsPlanIdFeature,
  resolveRetailOpsPlanId,
} from "../retail-ops-subscriptions"
import {
  activeBusinessNotificationTypes,
  notificationAudienceSql,
} from "./state"

const claimOptions = z
  .object({
    limit: z.number().int().min(1).max(10).default(5),
    leaseSeconds: z.number().int().min(60).max(900).default(300),
  })
  .strict()
const claimSchema = z
  .object({ id: z.string().min(1), claimId: z.string().uuid() })
  .strict()
type Claim = z.infer<typeof claimSchema>

/** No types are claimed until the explicit producer/privacy readiness list releases them. */
export async function claimBusinessNotificationFanout(
  db: PrismaClient,
  raw: z.input<typeof claimOptions> = {},
): Promise<Claim[]> {
  const options = claimOptions.parse(raw)
  if (!activeBusinessNotificationTypes.length) return []
  const claimId = randomUUID()
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`UPDATE "BusinessActivityOutbox" SET status='FAILED',"failureCode"='ATTEMPTS_EXHAUSTED',"claimId"=NULL,"claimExpiresAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
      WHERE consumer='in_app' AND "attemptCount">=5 AND ((status='PENDING' AND "nextAttemptAt"<=CURRENT_TIMESTAMP) OR (status='CLAIMED' AND "claimExpiresAt"<CURRENT_TIMESTAMP))`
      return tx.$queryRaw<Claim[]>`WITH due AS (
      SELECT o.id FROM "BusinessActivityOutbox" o JOIN "BusinessActivityEvent" e ON e.id=o."eventId" AND e."tenantId"=o."tenantId"
      JOIN "Tenant" t ON t.id=e."tenantId" AND t."isActive"
      WHERE o.consumer='in_app' AND o."attemptCount"<5 AND e."recordingOrigin"='snapshot' AND e.type IN (${Prisma.join(activeBusinessNotificationTypes)})
      AND ((o.status='PENDING' AND o."nextAttemptAt"<=CURRENT_TIMESTAMP) OR (o.status='CLAIMED' AND o."claimExpiresAt"<CURRENT_TIMESTAMP))
      ORDER BY o."nextAttemptAt",o.id LIMIT ${options.limit} FOR UPDATE OF o SKIP LOCKED
    ) UPDATE "BusinessActivityOutbox" o SET status='CLAIMED',"claimId"=${claimId},"claimExpiresAt"=CURRENT_TIMESTAMP+${options.leaseSeconds}*INTERVAL '1 second',"attemptCount"=o."attemptCount"+1,"updatedAt"=CURRENT_TIMESTAMP
      FROM due WHERE o.id=due.id RETURNING o.id,o."claimId"`
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** Source-owned fanout: bounded receipt batch, repeated current policy/domain authority, no external delivery. */
export async function fanoutBusinessNotificationsInTransaction(
  tx: Prisma.TransactionClient,
  raw: Claim,
) {
  const claim = claimSchema.parse(raw)
  const locks = await tx.$queryRaw<
    Array<{ eventId: string; tenantId: string }>
  >`SELECT "eventId","tenantId" FROM "BusinessActivityOutbox"
    WHERE id=${claim.id} AND "claimId"=${claim.claimId} AND status='CLAIMED' AND "claimExpiresAt">CURRENT_TIMESTAMP FOR UPDATE`
  const lease = locks[0]
  if (!lease)
    throw new BusinessActivityError(
      "CONFLICT",
      "This notification fanout lease is no longer current.",
    )
  const event = await tx.businessActivityEvent.findFirstOrThrow({
    where: { id: lease.eventId, tenantId: lease.tenantId },
    select: {
      id: true,
      type: true,
      occurredAt: true,
      recordingOrigin: true,
      tenant: {
        select: {
          isActive: true,
          metadata: true,
          subscription: { select: { plan: { select: { key: true } } } },
        },
      },
    },
  })
  if (
    event.recordingOrigin !== "snapshot" ||
    !activeBusinessNotificationTypes.some((type) => type === event.type)
  )
    throw new BusinessActivityError(
      "CONFLICT",
      "This activity source is not released for notification delivery.",
    )
  let finance = false
  try {
    assertRetailOpsPlanIdFeature(
      resolveRetailOpsPlanId({
        metadata: event.tenant.metadata,
        subscriptionPlanKey: event.tenant.subscription?.plan.key,
      }),
      "finance",
    )
    finance = true
  } catch (error) {
    if (!(error instanceof RetailOpsSubscriptionError)) throw error
  }
  const members = !event.tenant.isActive
    ? []
    : await tx.$queryRaw<Array<{ id: string }>>`
    SELECT m.id FROM "Membership" m JOIN "BusinessActivityEvent" e ON e."tenantId"=m."tenantId" AND e.id=${event.id}
    WHERE m.status='ACTIVE'
      AND ${notificationAudienceSql(Prisma.sql`m.id`, Prisma.sql`m.role::text`)}
      AND ((m.role IN ('OWNER','ADMIN') AND (e.category <> 'finance' OR ${finance})) OR
        (m.role IN ('MANAGER','CASHIER','OPERATOR') AND e.type IN ('order.recorded','payment.recorded','payment.refund_recorded')
          AND EXISTS (SELECT 1 FROM "CommercialOrder" co JOIN "Store" s ON s.id=co."storeId" AND s."tenantId"=co."tenantId" AND s.status='ACTIVE'
            WHERE co.id=e.payload->>'orderId' AND co."tenantId"=e."tenantId" AND co."storeId"=e."storeId"
              AND (m."staffAccessMode" <> 'SCOPED' OR EXISTS (SELECT 1 FROM "StaffStoreAssignment" a WHERE a."tenantId"=m."tenantId" AND a."membershipId"=m.id AND a."storeId"=s.id AND a.status='ACTIVE'))
              AND (m.role='MANAGER' OR s."salesRepOrderVisibility"='ALL_STORE_ORDERS' OR co."createdByUserId"=m."userId"))))
      AND NOT EXISTS (SELECT 1 FROM "BusinessNotificationReceipt" r WHERE r."tenantId"=e."tenantId" AND r."eventId"=e.id AND r."membershipId"=m.id)
    ORDER BY m.id LIMIT 101 FOR SHARE OF m`
  const visible = members.slice(0, 100)
  const created = visible.length
    ? await tx.businessNotificationReceipt.createMany({
        data: visible.map((member) => ({
          tenantId: lease.tenantId,
          eventId: event.id,
          membershipId: member.id,
          occurredAt: event.occurredAt,
        })),
        skipDuplicates: true,
      })
    : { count: 0 }
  const more = members.length > 100
  await tx.businessActivityOutbox.update({
    where: { id: claim.id },
    data: {
      status: more ? "PENDING" : "COMPLETED",
      attemptCount: 0,
      claimId: null,
      claimExpiresAt: null,
      failureCode: null,
      nextAttemptAt: new Date(Date.now() + 1000),
      completedAt: more ? null : new Date(),
    },
  })
  return { created: created.count, more }
}
export async function fanoutBusinessNotifications(
  db: PrismaClient,
  claim: Claim,
) {
  return db.$transaction(
    (tx) => fanoutBusinessNotificationsInTransaction(tx, claim),
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
export async function releaseFailedBusinessNotificationFanout(
  db: PrismaClient,
  raw: Claim,
) {
  const claim = claimSchema.parse(raw)
  // No error body/payload/recipient identity is persisted in operational diagnostics.
  const changed =
    await db.$executeRaw`UPDATE "BusinessActivityOutbox" SET status=CASE WHEN "attemptCount">=5 THEN 'FAILED'::"BusinessActivityOutboxStatus" ELSE 'PENDING'::"BusinessActivityOutboxStatus" END,
    "nextAttemptAt"=CURRENT_TIMESTAMP+LEAST(900,15*power(2,"attemptCount"))*INTERVAL '1 second',"claimId"=NULL,"claimExpiresAt"=NULL,"failureCode"='FANOUT_FAILED',"updatedAt"=CURRENT_TIMESTAMP
    WHERE id=${claim.id} AND "claimId"=${claim.claimId} AND status='CLAIMED'`
  return { released: changed === 1 }
}
