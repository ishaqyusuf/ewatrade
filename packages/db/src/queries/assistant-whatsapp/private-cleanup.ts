import { createHash } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { cancelAssistantWhatsAppQueuedWorkInTransaction } from "./queued-work"

const maximumRows = 2000
export class AssistantWhatsAppPrivateCleanupError extends Error {
  constructor(
    readonly code:
      | "PRIVATE_WORK_UNRESOLVED"
      | "SHARED_SCOPE_REVIEW_REQUIRED"
      | "SCOPE_CHANGED",
  ) {
    super(code)
    this.name = "AssistantWhatsAppPrivateCleanupError"
  }
}
function shared() {
  throw new AssistantWhatsAppPrivateCleanupError("SHARED_SCOPE_REVIEW_REQUIRED")
}
function bounded(...rows: readonly unknown[][]) {
  if (rows.reduce((sum, items) => sum + items.length, 0) > maximumRows)
    throw new AssistantWhatsAppPrivateCleanupError("PRIVATE_WORK_UNRESOLVED")
}

/** Exact own-account attribution only; no provider callback or raw content/proof is read. Caller holds the owning privacy transaction. */
export async function readAssistantWhatsAppPrivateCleanupSnapshot(
  tx: Prisma.TransactionClient,
  subjectId: string,
  now: Date,
) {
  const identities = await tx.assistantWhatsAppIdentity.findMany({
    where: { userId: subjectId },
    orderBy: { id: "asc" },
    take: maximumRows + 1,
    select: {
      id: true,
      userId: true,
      generation: true,
      selectionGeneration: true,
      activeBindingId: true,
      revokedAt: true,
      updatedAt: true,
    },
  })
  const grants = await tx.assistantWhatsAppGrant.findMany({
    where: {
      OR: [
        { identity: { userId: subjectId } },
        { membership: { userId: subjectId } },
      ],
    },
    orderBy: { id: "asc" },
    take: maximumRows + 1,
    select: {
      id: true,
      identityId: true,
      generation: true,
      revokedAt: true,
      updatedAt: true,
      membership: { select: { userId: true } },
    },
  })
  const bindings = await tx.assistantWhatsAppBinding.findMany({
    where: {
      OR: [
        { identity: { userId: subjectId } },
        { conversation: { ownerUserId: subjectId } },
        { grant: { identity: { userId: subjectId } } },
        { grant: { membership: { userId: subjectId } } },
      ],
    },
    orderBy: { id: "asc" },
    take: maximumRows + 1,
    select: {
      id: true,
      identityId: true,
      grantId: true,
      conversation: { select: { ownerUserId: true } },
    },
  })
  const links = await tx.assistantWhatsAppLink.findMany({
    where: {
      OR: [{ userId: subjectId }, { membership: { userId: subjectId } }],
    },
    orderBy: { id: "asc" },
    take: maximumRows + 1,
    select: {
      id: true,
      userId: true,
      revision: true,
      cancelledAt: true,
      confirmedAt: true,
      expiresAt: true,
      membership: { select: { userId: true } },
    },
  })
  bounded(identities, grants, bindings, links)
  const identityIds = new Set(identities.map((row) => row.id))
  const grantIds = new Set(grants.map((row) => row.id))
  const bindingIds = new Set(bindings.map((row) => row.id))
  if (
    grants.some(
      (row) =>
        !identityIds.has(row.identityId) || row.membership.userId !== subjectId,
    ) ||
    bindings.some(
      (row) =>
        !identityIds.has(row.identityId) ||
        !grantIds.has(row.grantId) ||
        row.conversation.ownerUserId !== subjectId,
    ) ||
    links.some(
      (row) => row.userId !== subjectId || row.membership.userId !== subjectId,
    )
  )
    shared()
  const inbox = await tx.assistantWhatsAppInbox.findMany({
    where: {
      OR: [
        { identity: { userId: subjectId } },
        { binding: { identity: { userId: subjectId } } },
        { binding: { conversation: { ownerUserId: subjectId } } },
      ],
    },
    orderBy: { id: "asc" },
    take: maximumRows + 1,
    select: {
      id: true,
      identityId: true,
      bindingId: true,
      state: true,
      leaseOwner: true,
      leaseExpiresAt: true,
      updatedAt: true,
    },
  })
  if (
    inbox.some(
      (row) =>
        (row.identityId && !identityIds.has(row.identityId)) ||
        (row.bindingId && !bindingIds.has(row.bindingId)),
    )
  )
    shared()
  const outbox = await tx.assistantWhatsAppOutbox.findMany({
    where: { inboxId: { in: inbox.map((row) => row.id) } },
    orderBy: { id: "asc" },
    take: maximumRows + 1,
    select: {
      id: true,
      state: true,
      leaseOwner: true,
      leaseExpiresAt: true,
      updatedAt: true,
    },
  })
  const attempts = await tx.assistantWhatsAppAttempt.findMany({
    where: { outboxId: { in: outbox.map((row) => row.id) } },
    orderBy: { id: "asc" },
    take: maximumRows + 1,
    select: { id: true, state: true, updatedAt: true },
  })
  const selections = await tx.assistantWhatsAppSelection.findMany({
    where: { identity: { userId: subjectId } },
    orderBy: { id: "asc" },
    take: maximumRows + 1,
    select: { id: true },
  })
  const usage = await tx.assistantWhatsAppUsageBucket.findMany({
    where: { userId: subjectId },
    orderBy: { id: "asc" },
    take: maximumRows + 1,
    select: { id: true, updatedAt: true },
  })
  bounded(
    identities,
    grants,
    bindings,
    links,
    inbox,
    outbox,
    attempts,
    selections,
    usage,
  )
  const foreignActionReview = await tx.assistantWhatsAppActionReview.count({
    where: {
      OR: [
        { bindingId: { in: [...bindingIds] } },
        { proposal: { actorUserId: subjectId } },
        { proposal: { conversation: { ownerUserId: subjectId } } },
        { reviewOutboxId: { in: outbox.map((row) => row.id) } },
      ],
      NOT: {
        binding: {
          identity: { userId: subjectId },
          conversation: { ownerUserId: subjectId },
        },
        proposal: {
          actorUserId: subjectId,
          conversation: { ownerUserId: subjectId },
        },
        reviewOutbox: {
          inbox: {
            OR: [
              { identity: { userId: subjectId } },
              {
                binding: {
                  identity: { userId: subjectId },
                  conversation: { ownerUserId: subjectId },
                },
              },
            ],
          },
        },
      },
    },
  })
  const foreignWorkflowReview = await tx.assistantWhatsAppWorkflowReview.count({
    where: {
      OR: [
        { bindingId: { in: [...bindingIds] } },
        { conversation: { ownerUserId: subjectId } },
        { draft: { conversation: { ownerUserId: subjectId } } },
        { reviewOutboxId: { in: outbox.map((row) => row.id) } },
      ],
      NOT: {
        binding: {
          identity: { userId: subjectId },
          conversation: { ownerUserId: subjectId },
        },
        conversation: { ownerUserId: subjectId },
        draft: { conversation: { ownerUserId: subjectId } },
        reviewOutbox: {
          inbox: {
            OR: [
              { identity: { userId: subjectId } },
              {
                binding: {
                  identity: { userId: subjectId },
                  conversation: { ownerUserId: subjectId },
                },
              },
            ],
          },
        },
      },
    },
  })
  if (foreignActionReview || foreignWorkflowReview) shared()
  const unresolved =
    outbox.some(
      (row) =>
        ["SENDING", "UNKNOWN"].includes(row.state) ||
        row.leaseOwner ||
        (row.leaseExpiresAt && row.leaseExpiresAt > now),
    ) ||
    attempts.some((row) => ["STARTED", "UNKNOWN"].includes(row.state)) ||
    inbox.some(
      (row) =>
        ["PENDING", "PROCESSING"].includes(row.state) ||
        row.leaseOwner ||
        (row.leaseExpiresAt && row.leaseExpiresAt > now),
    )
  const rows = {
    identities,
    grants,
    bindings,
    links,
    inbox,
    outbox,
    attempts,
    selections,
    usage,
  }
  const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex")
  return { ...rows, unresolved, digest }
}

export type AssistantWhatsAppPrivateCleanupSnapshot = Awaited<
  ReturnType<typeof readAssistantWhatsAppPrivateCleanupSnapshot>
>

/** Fencing commits even when unresolved transport must remain for real callback/status reconciliation. */
export async function prepareAssistantWhatsAppPrivateCleanupInTransaction(
  tx: Prisma.TransactionClient,
  subjectId: string,
  now: Date,
) {
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "userId"=${subjectId} ORDER BY id FOR UPDATE`
  const before = await readAssistantWhatsAppPrivateCleanupSnapshot(
    tx,
    subjectId,
    now,
  )
  for (const identity of before.identities) {
    if (!identity.revokedAt)
      await tx.assistantWhatsAppIdentity.update({
        where: { id: identity.id },
        data: {
          revokedAt: now,
          activeBindingId: null,
          generation: { increment: 1 },
          selectionGeneration: { increment: 1 },
          controlSequence: { increment: 1 },
        },
      })
    await tx.assistantWhatsAppGrant.updateMany({
      where: { identityId: identity.id, revokedAt: null },
      data: { revokedAt: now, generation: { increment: 1 } },
    })
    await cancelAssistantWhatsAppQueuedWorkInTransaction(
      tx,
      identity.id,
      null,
      now,
      { includeControls: true, reason: "CHANNEL_DISCONNECTED" },
    )
  }
  await tx.assistantWhatsAppLink.updateMany({
    where: { userId: subjectId, cancelledAt: null },
    data: { cancelledAt: now },
  })
  return readAssistantWhatsAppPrivateCleanupSnapshot(tx, subjectId, now)
}

/** No unbounded cascades into another actor, or unresolved original HTTP proof. */
export async function eraseAssistantWhatsAppPrivateCleanupInTransaction(
  tx: Prisma.TransactionClient,
  subjectId: string,
  expected: AssistantWhatsAppPrivateCleanupSnapshot,
  now: Date,
) {
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "userId"=${subjectId} ORDER BY id FOR UPDATE`
  const fresh = await readAssistantWhatsAppPrivateCleanupSnapshot(
    tx,
    subjectId,
    now,
  )
  if (fresh.unresolved)
    throw new AssistantWhatsAppPrivateCleanupError("PRIVATE_WORK_UNRESOLVED")
  if (fresh.digest !== expected.digest)
    throw new AssistantWhatsAppPrivateCleanupError("SCOPE_CHANGED")
  const controlsRemoved = await tx.assistantWhatsAppInbox.deleteMany({
    where: { id: { in: fresh.inbox.map((row) => row.id) } },
  })
  const identitiesRemoved = await tx.assistantWhatsAppIdentity.deleteMany({
    where: {
      id: { in: fresh.identities.map((row) => row.id) },
      userId: subjectId,
      revokedAt: { not: null },
    },
  })
  const linksRemoved = await tx.assistantWhatsAppLink.deleteMany({
    where: {
      id: { in: fresh.links.map((row) => row.id) },
      userId: subjectId,
      cancelledAt: { not: null },
    },
  })
  const usageRemoved = await tx.assistantWhatsAppUsageBucket.deleteMany({
    where: { id: { in: fresh.usage.map((row) => row.id) }, userId: subjectId },
  })
  return (
    controlsRemoved.count +
    identitiesRemoved.count +
    linksRemoved.count +
    usageRemoved.count
  )
}
