import type {
  AssistantWhatsAppGrant,
  AssistantWhatsAppIdentity,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import { cancelAssistantWhatsAppQueuedWorkInTransaction } from "./queued-work"

/** Caller holds the identity lock; one business revocation preserves other bindings/grants. */
export async function invalidateAssistantWhatsAppGrantInTransaction(
  tx: Prisma.TransactionClient,
  identity: AssistantWhatsAppIdentity,
  grant: AssistantWhatsAppGrant,
  reason: "GRANT_REVOKED" | "GRANT_EXPIRED",
  now: Date,
) {
  if (grant.revokedAt)
    return cancelAssistantWhatsAppQueuedWorkInTransaction(
      tx,
      identity.id,
      null,
      now,
      {
        grantId: grant.id,
        reason,
      },
    )
  await tx.assistantWhatsAppGrant.update({
    where: { id: grant.id },
    data: { revokedAt: now, generation: { increment: 1 } },
  })
  const active = identity.activeBindingId
    ? await tx.assistantWhatsAppBinding.findFirst({
        where: {
          id: identity.activeBindingId,
          identityId: identity.id,
          grantId: grant.id,
        },
        select: { id: true },
      })
    : null
  await tx.assistantWhatsAppIdentity.update({
    where: { id: identity.id },
    data: {
      controlSequence: { increment: 1 },
      ...(active
        ? { activeBindingId: null, selectionGeneration: { increment: 1 } }
        : {}),
    },
  })
  return cancelAssistantWhatsAppQueuedWorkInTransaction(
    tx,
    identity.id,
    null,
    now,
    {
      grantId: grant.id,
      includeControls: true,
      reason,
    },
  )
}

/** Bounded consent expiry runs before the rollout switch, including during outages/disable. */
export async function expireAssistantWhatsAppGrants(
  db: PrismaClient,
  now = new Date(),
  grantIds?: readonly string[],
) {
  const rows = await db.assistantWhatsAppGrant.findMany({
    where: {
      id: grantIds ? { in: [...grantIds] } : undefined,
      revokedAt: null,
      OR: [{ expiresAt: { lte: now } }, { idleExpiresAt: { lte: now } }],
    },
    orderBy: { id: "asc" },
    take: 25,
    select: { id: true, identityId: true },
  })
  let expired = 0
  let cleared = 0
  for (const row of rows) {
    const result = await runInOwnSerializableTransaction(db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE id=${row.identityId} FOR UPDATE`
      const identity = await tx.assistantWhatsAppIdentity.findUnique({
        where: { id: row.identityId },
      })
      const grant = await tx.assistantWhatsAppGrant.findFirst({
        where: {
          id: row.id,
          identityId: row.identityId,
          revokedAt: null,
          OR: [{ expiresAt: { lte: now } }, { idleExpiresAt: { lte: now } }],
        },
      })
      // Fresh consent/activity may have won after the bounded candidate query.
      if (!identity || !grant) return null
      return invalidateAssistantWhatsAppGrantInTransaction(
        tx,
        identity,
        grant,
        "GRANT_EXPIRED",
        now,
      )
    })
    if (result) {
      expired++
      cleared += result.inbox + result.pending + result.uncertain
    }
  }
  const reviews = await db.assistantWhatsAppActionReview.findMany({
    where: { state: "PENDING", expiresAt: { lte: now } },
    orderBy: { id: "asc" },
    take: 25,
    select: { id: true, binding: { select: { identityId: true } } },
  })
  for (const review of reviews) {
    cleared += await runInOwnSerializableTransaction(db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE id=${review.binding.identityId} FOR UPDATE`
      return (
        await tx.assistantWhatsAppActionReview.updateMany({
          where: { id: review.id, state: "PENDING", expiresAt: { lte: now } },
          data: { state: "EXPIRED", completedAt: now },
        })
      ).count
    })
  }
  const workflowReviews = await db.assistantWhatsAppWorkflowReview.findMany({
    where: { state: "PENDING", expiresAt: { lte: now } },
    orderBy: { id: "asc" },
    take: 25,
    select: { id: true, binding: { select: { identityId: true } } },
  })
  for (const review of workflowReviews) {
    cleared += await runInOwnSerializableTransaction(db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE id=${review.binding.identityId} FOR UPDATE`
      return (
        await tx.assistantWhatsAppWorkflowReview.updateMany({
          where: { id: review.id, state: "PENDING", expiresAt: { lte: now } },
          data: { state: "EXPIRED", completedAt: now },
        })
      ).count
    })
  }
  return { expired, cleared }
}
