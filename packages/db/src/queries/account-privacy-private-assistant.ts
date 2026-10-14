import { createHash } from "node:crypto"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "./own-transaction"

const policySchema = z
  .object({
    version: z.string().trim().min(1).max(100),
    approvalReference: z.string().trim().min(1).max(300),
    approvedAt: z.string().datetime(),
    reviewAt: z.string().datetime(),
    mode: z.literal("ERASE_PRIVATE_ASSISTANT_DATA"),
  })
  .strict()
export function getApprovedPrivateAssistantPolicy(
  environment = process.env,
  now = new Date(),
) {
  const raw = environment.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_POLICY_JSON
  const digest =
    environment.ACCOUNT_PRIVACY_APPROVED_PRIVATE_ASSISTANT_POLICY_SHA256
  if (
    !raw ||
    !digest ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    createHash("sha256").update(raw).digest("hex") !== digest
  )
    return null
  try {
    const result = policySchema.safeParse(JSON.parse(raw))
    if (
      !result.success ||
      !Number.isFinite(now.getTime()) ||
      result.data.version !==
        environment.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim() ||
      new Date(result.data.approvedAt) > now ||
      new Date(result.data.reviewAt) <= now
    )
      return null
    return { ...result.data, digest }
  } catch {
    return null
  }
}
export class AccountPrivacyPrivateAssistantError extends Error {
  constructor(
    readonly code:
      | "DISABLED"
      | "POLICY_NOT_APPROVED"
      | "OPERATOR_REQUIRED"
      | "NOT_READY"
      | "PRIVATE_WORK_UNRESOLVED"
      | "SHARED_SCOPE_REVIEW_REQUIRED"
      | "MEDIA_DELETION_UNCONFIRMED"
      | "SCOPE_CHANGED",
  ) {
    super(code)
    this.name = "AccountPrivacyPrivateAssistantError"
  }
}
export type AccountPrivacyPrivateAttachment = {
  id: string
  tenantId: string
  conversationId: string
  contentDigest: string
  contentType: string
  sizeBytes: number
  storageProvider: string | null
  storageStoreId: string | null
  storagePath: string | null
  dataClassification: "LIVE" | "QA"
}
export type AccountPrivacyPrivateMediaPort = (
  attachment: AccountPrivacyPrivateAttachment,
) => Promise<void>

async function context(
  tx: Prisma.TransactionClient,
  input: { requestId: string; operatorUserId: string },
  now: Date,
) {
  const operator = await tx.user.findUnique({
    where: { id: input.operatorUserId },
    select: { isPlatformAdmin: true },
  })
  if (!operator?.isPlatformAdmin)
    throw new AccountPrivacyPrivateAssistantError("OPERATOR_REQUIRED")
  const request = await tx.accountPrivacyRequest.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      requestKey: true,
      userId: true,
      verifiedSubjectUserId: true,
      verifiedAt: true,
      status: true,
      contactEmail: true,
      outcome: true,
      user: { select: { email: true, emailVerified: true } },
      accessRevocation: { select: { status: true, userId: true } },
    },
  })
  const subjectId = request?.verifiedSubjectUserId
  if (
    !request ||
    !subjectId ||
    subjectId === input.operatorUserId ||
    request.userId !== subjectId ||
    request.requestKey !== `account-deletion:${subjectId}` ||
    request.status !== "PROCESSING" ||
    !request.verifiedAt ||
    request.verifiedAt > now ||
    !request.contactEmail ||
    !request.user?.emailVerified ||
    request.user.email.trim().toLowerCase() !==
      request.contactEmail.trim().toLowerCase() ||
    request.accessRevocation?.status !== "REVOKED" ||
    request.accessRevocation.userId !== subjectId
  )
    throw new AccountPrivacyPrivateAssistantError("NOT_READY")
  return { request, subjectId }
}

export async function countAccountPrivacyPrivateAssistant(
  db: Pick<
    PrismaClient,
    | "assistantConversation"
    | "assistantRun"
    | "assistantAttachment"
    | "assistantUsageEvent"
    | "assistantActionProposal"
  >,
  subjectId: string,
) {
  // Sequential inside a one-connection transaction. Counts include orphan actor usage.
  const conversations = await db.assistantConversation.count({
    where: { ownerUserId: subjectId },
  })
  const runs = await db.assistantRun.count({
    where: { actorUserId: subjectId },
  })
  const attachments = await db.assistantAttachment.count({
    where: { actorUserId: subjectId },
  })
  const usage = await db.assistantUsageEvent.count({
    where: { actorUserId: subjectId },
  })
  const proposals = await db.assistantActionProposal.count({
    where: { actorUserId: subjectId },
  })
  return {
    conversations,
    runs,
    attachments,
    usage,
    proposals,
    total: conversations + runs + attachments + usage + proposals,
  }
}

async function snapshot(
  tx: Prisma.TransactionClient,
  subjectId: string,
  now: Date,
) {
  // Mixed ownership must not turn a private purge into another user's deletion.
  for (const count of [
    await tx.assistantRun.count({
      where: {
        actorUserId: subjectId,
        conversation: { ownerUserId: { not: subjectId } },
      },
    }),
    await tx.assistantAttachment.count({
      where: {
        actorUserId: subjectId,
        conversation: { ownerUserId: { not: subjectId } },
      },
    }),
    await tx.assistantActionProposal.count({
      where: {
        actorUserId: subjectId,
        conversation: { ownerUserId: { not: subjectId } },
      },
    }),
    await tx.assistantRun.count({
      where: {
        actorUserId: { not: subjectId },
        conversation: { ownerUserId: subjectId },
      },
    }),
    await tx.assistantAttachment.count({
      where: {
        actorUserId: { not: subjectId },
        conversation: { ownerUserId: subjectId },
      },
    }),
    await tx.assistantActionProposal.count({
      where: {
        actorUserId: { not: subjectId },
        conversation: { ownerUserId: subjectId },
      },
    }),
    await tx.assistantUsageEvent.count({
      where: {
        actorUserId: { not: subjectId },
        run: { conversation: { ownerUserId: subjectId } },
      },
    }),
  ])
    if (count)
      throw new AccountPrivacyPrivateAssistantError(
        "SHARED_SCOPE_REVIEW_REQUIRED",
      )
  if (
    (await tx.assistantRun.count({
      where: { actorUserId: subjectId, status: "RUNNING" },
    })) ||
    (await tx.assistantActionProposal.count({
      where: { actorUserId: subjectId, status: "EXECUTING" },
    })) ||
    (await tx.assistantAttachment.count({
      where: {
        actorUserId: subjectId,
        OR: [
          { status: "PROCESSING" },
          { leaseUntil: { not: null } },
          { status: "PENDING_UPLOAD", uploadExpiresAt: { gt: now } },
        ],
      },
    }))
  )
    throw new AccountPrivacyPrivateAssistantError("PRIVATE_WORK_UNRESOLVED")
  const conversations = await tx.assistantConversation.findMany({
    where: { ownerUserId: subjectId },
    select: { id: true, updatedAt: true },
    orderBy: { id: "asc" },
    take: 20,
  })
  const attachments = await tx.assistantAttachment.findMany({
    where: { actorUserId: subjectId },
    select: {
      id: true,
      tenantId: true,
      conversationId: true,
      contentDigest: true,
      contentType: true,
      sizeBytes: true,
      storageProvider: true,
      storageStoreId: true,
      storagePath: true,
      updatedAt: true,
      conversation: {
        select: {
          ownerUserId: true,
          tenant: { select: { dataClassification: true } },
        },
      },
    },
    orderBy: { id: "asc" },
    take: 50,
  })
  const usage = await tx.assistantUsageEvent.findMany({
    where: { actorUserId: subjectId },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 500,
  })
  const normalized = attachments.map(({ conversation, ...row }) => ({
    ...row,
    dataClassification: conversation.tenant.dataClassification,
  }))
  const digest = createHash("sha256")
    .update(JSON.stringify({ conversations, attachments: normalized, usage }))
    .digest("hex")
  return { conversations, attachments: normalized, usage, digest }
}

/** Bounded replay-safe batches. Original file references stay until verified byte removal; no provider call is inside a retried DB transaction. */
export async function processAccountPrivacyPrivateAssistant(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
  removeBytes?: AccountPrivacyPrivateMediaPort,
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyPrivateAssistantError("DISABLED")
  const now = input.now ?? new Date()
  const policy = getApprovedPrivateAssistantPolicy(process.env, now)
  if (!policy)
    throw new AccountPrivacyPrivateAssistantError("POLICY_NOT_APPROVED")
  const before = await runInOwnSerializableTransaction(db, async (tx) => {
    const { subjectId } = await context(tx, input, now)
    return { subjectId, ...(await snapshot(tx, subjectId, now)) }
  })
  for (const attachment of before.attachments) {
    // Missing original ownership is uncertainty, never proof that bytes do not exist.
    if (
      !attachment.storagePath ||
      !attachment.storageProvider ||
      !attachment.storageStoreId
    )
      throw new AccountPrivacyPrivateAssistantError(
        "MEDIA_DELETION_UNCONFIRMED",
      )
    if (!removeBytes)
      throw new AccountPrivacyPrivateAssistantError(
        "MEDIA_DELETION_UNCONFIRMED",
      )
    // Fresh authority before every outside-system action; callback is a trusted server adapter, never caller-supplied evidence.
    await runInOwnSerializableTransaction(db, (tx) =>
      context(tx, input, new Date()),
    )
    try {
      await removeBytes(attachment)
    } catch {
      throw new AccountPrivacyPrivateAssistantError(
        "MEDIA_DELETION_UNCONFIRMED",
      )
    }
  }
  return runInOwnSerializableTransaction(db, async (tx) => {
    const { request, subjectId } = await context(tx, input, now)
    const fresh = await snapshot(tx, subjectId, now)
    if (fresh.digest !== before.digest) {
      const residual = await countAccountPrivacyPrivateAssistant(tx, subjectId)
      if (residual.total === 0)
        return {
          requestId: request.id,
          remaining: 0,
          replay: true,
          attachmentsRemoved: 0,
          conversationsRemoved: 0,
          usageRemoved: 0,
        }
      throw new AccountPrivacyPrivateAssistantError("SCOPE_CHANGED")
    }
    const attachmentsRemoved = await tx.assistantAttachment.deleteMany({
      where: {
        id: { in: fresh.attachments.map((row) => row.id) },
        actorUserId: subjectId,
      },
    })
    const usageRemoved = await tx.assistantUsageEvent.deleteMany({
      where: {
        id: { in: fresh.usage.map((row) => row.id) },
        actorUserId: subjectId,
      },
    })
    // Cascades only owned private children after all their object references have been reconciled.
    const conversationsRemoved = await tx.assistantConversation.deleteMany({
      where: {
        id: { in: fresh.conversations.map((row) => row.id) },
        ownerUserId: subjectId,
        attachments: { none: {} },
      },
    })
    const remaining = await countAccountPrivacyPrivateAssistant(tx, subjectId)
    const removed =
      attachmentsRemoved.count + usageRemoved.count + conversationsRemoved.count
    if (removed) {
      const previous =
        request.outcome &&
        typeof request.outcome === "object" &&
        !Array.isArray(request.outcome)
          ? request.outcome
          : {}
      await tx.accountPrivacyRequest.update({
        where: { id: request.id },
        data: {
          outcome: {
            ...previous,
            privateAssistantCleanup: {
              processor: "account-privacy-private-assistant-v1",
              policyVersion: policy.version,
              policyDigest: policy.digest,
              operatorUserId: input.operatorUserId,
              lastBatchDigest: fresh.digest,
              lastBatchAt: now.toISOString(),
              remaining: remaining.total,
            },
          },
        },
      })
    }
    return {
      requestId: request.id,
      remaining: remaining.total,
      replay: removed === 0,
      attachmentsRemoved: attachmentsRemoved.count,
      conversationsRemoved: conversationsRemoved.count,
      usageRemoved: usageRemoved.count,
    }
  })
}
