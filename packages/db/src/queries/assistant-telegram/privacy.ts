import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { cancelTelegramWork } from "./link"

export class AssistantTelegramPrivateCleanupError extends Error {
  constructor(
    readonly code:
      | "SHARED_SCOPE_REVIEW_REQUIRED"
      | "PRIVATE_WORK_UNRESOLVED"
      | "SCOPE_CHANGED",
  ) {
    super(code)
    this.name = "AssistantTelegramPrivateCleanupError"
  }
}

type TelegramPrivacyInventory = {
  assistantTelegramIdentities: number
  assistantTelegramLinks: number
  assistantTelegramGrants: number
  assistantTelegramBindings: number
  assistantTelegramInbox: number
  assistantTelegramOutbox: number
  assistantTelegramActionReviews: number
}

// Every cascade edge is checked, including a review pointing through its outbox
// to a different binding and a proposal owned by a different account.
async function readTelegramPrivacyScope(
  db: Pick<PrismaClient, "$queryRaw">,
  subjectId: string,
  now: Date,
) {
  const rows = await db.$queryRaw<
    (TelegramPrivacyInventory & {
      mixedOwnership: boolean
      inFlight: boolean
    })[]
  >`
    WITH subject AS (SELECT ${subjectId}::text AS id),
    scoped_links AS (
      SELECT l.id, (l."userId"=s.id AND m."userId"=s.id) AS owned
      FROM "AssistantTelegramLink" l
      JOIN "Membership" m ON m.id=l."membershipId" AND m."tenantId"=l."tenantId"
      CROSS JOIN subject s
      WHERE l."userId"=s.id OR m."userId"=s.id
    ),
    scoped_grants AS (
      SELECT g.id, g."identityId", (i."userId"=s.id AND m."userId"=s.id) AS owned
      FROM "AssistantTelegramGrant" g
      JOIN "AssistantTelegramIdentity" i ON i.id=g."identityId"
      JOIN "Membership" m ON m.id=g."membershipId" AND m."tenantId"=g."tenantId"
      CROSS JOIN subject s
      WHERE i."userId"=s.id OR m."userId"=s.id
    ),
    scoped_bindings AS (
      SELECT b.id, b."conversationId", (
        i."userId"=s.id AND COALESCE(g.owned AND g."identityId"=b."identityId", false)
        AND c."ownerUserId"=s.id
      ) AS owned
      FROM "AssistantTelegramBinding" b
      JOIN "AssistantTelegramIdentity" i ON i.id=b."identityId"
      JOIN "AssistantConversation" c ON c.id=b."conversationId"
      LEFT JOIN scoped_grants g ON g.id=b."grantId"
      CROSS JOIN subject s
      WHERE i."userId"=s.id OR g.id IS NOT NULL OR c."ownerUserId"=s.id
    ),
    scoped_inbox AS (
      SELECT q.id, q."bindingId", (
        COALESCE(b.owned, false) AND
        (q."runId" IS NULL OR (r."actorUserId"=s.id AND r."conversationId"=b."conversationId"))
      ) AS owned, (
        q.state IN ('PENDING', 'PROCESSING') OR q."leaseOwner" IS NOT NULL OR q."leaseExpiresAt">${now}
      ) AS active
      FROM "AssistantTelegramInbox" q
      LEFT JOIN scoped_bindings b ON b.id=q."bindingId"
      LEFT JOIN "AssistantRun" r ON r.id=q."runId"
      CROSS JOIN subject s
      WHERE b.id IS NOT NULL OR r."actorUserId"=s.id
    ),
    scoped_outbox AS (
      SELECT o.id, q."bindingId", q.owned, (
        o.state IN ('PENDING', 'SENDING') OR o."leaseOwner" IS NOT NULL OR o."leaseExpiresAt">${now}
      ) AS active
      FROM "AssistantTelegramOutbox" o JOIN scoped_inbox q ON q.id=o."inboxId"
    ),
    scoped_reviews AS (
      SELECT r.id, (
        COALESCE(b.owned, false) AND COALESCE(o.owned AND o."bindingId"=r."bindingId", false)
        AND p."actorUserId"=s.id AND p."conversationId"=b."conversationId" AND c."ownerUserId"=s.id
      ) AS owned
      FROM "AssistantTelegramActionReview" r
      LEFT JOIN scoped_bindings b ON b.id=r."bindingId"
      LEFT JOIN scoped_outbox o ON o.id=r."outboxId"
      JOIN "AssistantActionProposal" p ON p.id=r."proposalId"
      JOIN "AssistantConversation" c ON c.id=p."conversationId"
      CROSS JOIN subject s
      WHERE b.id IS NOT NULL OR o.id IS NOT NULL OR p."actorUserId"=s.id OR c."ownerUserId"=s.id
    )
    SELECT
      (SELECT count(*)::int FROM "AssistantTelegramIdentity" WHERE "userId"=${subjectId}) AS "assistantTelegramIdentities",
      (SELECT count(*)::int FROM scoped_links) AS "assistantTelegramLinks",
      (SELECT count(*)::int FROM scoped_grants) AS "assistantTelegramGrants",
      (SELECT count(*)::int FROM scoped_bindings) AS "assistantTelegramBindings",
      (SELECT count(*)::int FROM scoped_inbox) AS "assistantTelegramInbox",
      (SELECT count(*)::int FROM scoped_outbox) AS "assistantTelegramOutbox",
      (SELECT count(*)::int FROM scoped_reviews) AS "assistantTelegramActionReviews",
      (EXISTS (SELECT 1 FROM scoped_links WHERE owned IS NOT TRUE)
        OR EXISTS (SELECT 1 FROM scoped_grants WHERE owned IS NOT TRUE)
        OR EXISTS (SELECT 1 FROM scoped_bindings WHERE owned IS NOT TRUE)
        OR EXISTS (SELECT 1 FROM scoped_inbox WHERE owned IS NOT TRUE)
        OR EXISTS (SELECT 1 FROM scoped_outbox WHERE owned IS NOT TRUE)
        OR EXISTS (SELECT 1 FROM scoped_reviews WHERE owned IS NOT TRUE)) AS "mixedOwnership",
      (EXISTS (SELECT 1 FROM scoped_inbox WHERE active)
        OR EXISTS (SELECT 1 FROM scoped_outbox WHERE active)) AS "inFlight"
  `
  const row = rows[0]
  if (
    !row ||
    typeof row.mixedOwnership !== "boolean" ||
    typeof row.inFlight !== "boolean"
  )
    throw new Error("Assistant Telegram privacy inventory unavailable.")
  const counts: TelegramPrivacyInventory = {
    assistantTelegramIdentities: row.assistantTelegramIdentities,
    assistantTelegramLinks: row.assistantTelegramLinks,
    assistantTelegramGrants: row.assistantTelegramGrants,
    assistantTelegramBindings: row.assistantTelegramBindings,
    assistantTelegramInbox: row.assistantTelegramInbox,
    assistantTelegramOutbox: row.assistantTelegramOutbox,
    assistantTelegramActionReviews: row.assistantTelegramActionReviews,
  }
  const values = Object.values(counts)
  if (values.some((count) => !Number.isSafeInteger(count) || count < 0))
    throw new Error("Assistant Telegram privacy inventory unavailable.")
  return {
    counts,
    total: values.reduce((sum, count) => sum + count, 0),
    mixedOwnership: row.mixedOwnership,
    unresolved: row.inFlight,
  }
}

export async function assistantTelegramPrivacyInventory(
  db: Pick<PrismaClient, "$queryRaw">,
  subjectId: string,
) {
  return (await readTelegramPrivacyScope(db, subjectId, new Date())).counts
}

function lockTelegramIdentities(
  tx: Prisma.TransactionClient,
  subjectId: string,
) {
  return tx.$queryRaw`SELECT id FROM "AssistantTelegramIdentity" WHERE "userId"=${subjectId} ORDER BY id FOR UPDATE`
}

/** Fences workers before the approved cleanup visits external attachment storage. */
export async function prepareAssistantTelegramPrivateCleanupInTransaction(
  tx: Prisma.TransactionClient,
  subjectId: string,
  now: Date,
) {
  await lockTelegramIdentities(tx, subjectId)
  const before = await readTelegramPrivacyScope(tx, subjectId, now)
  if (before.mixedOwnership)
    throw new AssistantTelegramPrivateCleanupError(
      "SHARED_SCOPE_REVIEW_REQUIRED",
    )
  if (!before.total) return before

  await tx.assistantTelegramIdentity.updateMany({
    where: { userId: subjectId, revokedAt: null },
    data: {
      revokedAt: now,
      activeBindingId: null,
      generation: { increment: 1 },
      selectionGeneration: { increment: 1 },
    },
  })
  await tx.assistantTelegramGrant.updateMany({
    where: { identity: { userId: subjectId }, revokedAt: null },
    data: { revokedAt: now, generation: { increment: 1 } },
  })
  await tx.assistantTelegramLink.updateMany({
    where: { userId: subjectId, cancelledAt: null },
    data: { cancelledAt: now, revision: { increment: 1 } },
  })
  await cancelTelegramWork(tx, { identity: { userId: subjectId } }, now)
  return readTelegramPrivacyScope(tx, subjectId, now)
}

export async function eraseAssistantTelegramPrivateCleanupInTransaction(
  tx: Prisma.TransactionClient,
  subjectId: string,
  expected: Awaited<
    ReturnType<typeof prepareAssistantTelegramPrivateCleanupInTransaction>
  >,
  now: Date,
) {
  await lockTelegramIdentities(tx, subjectId)
  const fresh = await readTelegramPrivacyScope(tx, subjectId, now)
  if (fresh.mixedOwnership)
    throw new AssistantTelegramPrivateCleanupError(
      "SHARED_SCOPE_REVIEW_REQUIRED",
    )
  if (fresh.unresolved)
    throw new AssistantTelegramPrivateCleanupError("PRIVATE_WORK_UNRESOLVED")
  if (JSON.stringify(fresh.counts) !== JSON.stringify(expected.counts))
    throw new AssistantTelegramPrivateCleanupError("SCOPE_CHANGED")
  if (!fresh.total) return 0

  const identities = await tx.assistantTelegramIdentity.deleteMany({
    where: { userId: subjectId, revokedAt: { not: null } },
  })
  const links = await tx.assistantTelegramLink.deleteMany({
    where: { userId: subjectId, cancelledAt: { not: null } },
  })
  if (
    identities.count !== fresh.counts.assistantTelegramIdentities ||
    links.count !== fresh.counts.assistantTelegramLinks
  )
    throw new AssistantTelegramPrivateCleanupError("SCOPE_CHANGED")
  return fresh.total
}
