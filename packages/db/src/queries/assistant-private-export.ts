import type { PrismaClient } from "../../generated/prisma/client"
import {
  AssistantPrivateExportError,
  ASSISTANT_PRIVATE_EXPORT_LIMITS as limits,
  projectAssistantPrivateExport,
} from "./assistant-private-export-projection"

export {
  ASSISTANT_PRIVATE_EXPORT_LIMITS,
  AssistantPrivateExportError,
  type AssistantPrivateExportAttachmentTarget,
} from "./assistant-private-export-projection"

export type AssistantPrivateExportClient = Pick<
  PrismaClient,
  | "accountPrivacyRequest"
  | "assistantConversation"
  | "assistantMessage"
  | "setupDraftEntity"
  | "assistantRun"
  | "assistantActionProposal"
  | "assistantAttachment"
  | "assistantUsageEvent"
  | "assistantWhatsAppIdentity"
  | "assistantWhatsAppGrant"
  | "assistantWhatsAppInbox"
  | "assistantWhatsAppOutbox"
>

/** Own-account service only; the API must derive userId from a fresh real Session. No merchant-role or deletion-policy authority. */
export async function readAssistantPrivateExport(
  db: AssistantPrivateExportClient,
  userId: string,
  options: { now?: Date } = {},
) {
  const now = options.now ?? new Date()
  if (!userId || userId.length > 200 || !Number.isFinite(now.getTime()))
    throw new AssistantPrivateExportError("UNAVAILABLE")
  const privacy = await db.accountPrivacyRequest.findUnique({
    where: { requestKey: `account-deletion:${userId}` },
    select: { status: true },
  })
  if (privacy?.status === "PROCESSING" || privacy?.status === "COMPLETED")
    throw new AssistantPrivateExportError("PRIVACY_BLOCKED")
  // The private category requires exact actor ownership in both directions.
  const mixed = {
    OR: [
      { actorUserId: userId, conversation: { ownerUserId: { not: userId } } },
      { actorUserId: { not: userId }, conversation: { ownerUserId: userId } },
    ],
  }
  for (const count of [
    await db.assistantRun.count({ where: mixed }),
    await db.assistantAttachment.count({ where: mixed }),
    await db.assistantActionProposal.count({ where: mixed }),
  ])
    if (count)
      throw new AssistantPrivateExportError("SHARED_SCOPE_REVIEW_REQUIRED")
  const conversationRows = await db.assistantConversation.findMany({
    where: { ownerUserId: userId },
    orderBy: { id: "asc" },
    take: limits.conversations + 1,
    select: {
      id: true,
      ownerUserId: true,
      tenantId: true,
      storeId: true,
      purpose: true,
      status: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      workflowContext: true,
      setupDraft: { select: { id: true, revision: true, updatedAt: true } },
    },
  })
  if (conversationRows.length > limits.conversations)
    throw new AssistantPrivateExportError("EXPORT_LIMIT")
  const messageRows = await db.assistantMessage.findMany({
    where: { conversation: { ownerUserId: userId } },
    orderBy: [{ conversationId: "asc" }, { sequence: "asc" }],
    take: limits.messages + 1,
    select: {
      id: true,
      conversationId: true,
      sequence: true,
      role: true,
      parts: true,
      createdAt: true,
    },
  })
  const entityRows = await db.setupDraftEntity.findMany({
    where: { draft: { conversation: { ownerUserId: userId } } },
    orderBy: [{ draftId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    take: limits.entities + 1,
    select: {
      id: true,
      draftId: true,
      kind: true,
      state: true,
      payload: true,
      sortOrder: true,
      updatedAt: true,
    },
  })
  if (
    messageRows.length > limits.messages ||
    entityRows.length > limits.entities
  )
    throw new AssistantPrivateExportError("EXPORT_LIMIT")
  const conversationIds = new Set(conversationRows.map((row) => row.id))
  const draftIds = new Set(
    conversationRows.flatMap((row) =>
      row.setupDraft ? [row.setupDraft.id] : [],
    ),
  )
  if (
    messageRows.some((row) => !conversationIds.has(row.conversationId)) ||
    entityRows.some((row) => !draftIds.has(row.draftId))
  )
    throw new AssistantPrivateExportError("SCOPE_CHANGED")
  const conversations = conversationRows.map((row) => ({
    ...row,
    messages: messageRows.filter(
      (message) => message.conversationId === row.id,
    ),
    setupDraft: row.setupDraft
      ? {
          ...row.setupDraft,
          entities: entityRows.filter(
            (entity) => entity.draftId === row.setupDraft?.id,
          ),
        }
      : null,
  }))
  const proposals = await db.assistantActionProposal.findMany({
    where: { actorUserId: userId, conversation: { ownerUserId: userId } },
    orderBy: { id: "asc" },
    take: limits.proposals + 1,
    select: {
      id: true,
      conversationId: true,
      actorUserId: true,
      action: true,
      status: true,
      revision: true,
      payload: true,
      updatedAt: true,
    },
  })
  const attachments = await db.assistantAttachment.findMany({
    where: { actorUserId: userId, conversation: { ownerUserId: userId } },
    orderBy: { id: "asc" },
    take: limits.attachments + 1,
    select: {
      id: true,
      conversationId: true,
      tenantId: true,
      storeId: true,
      actorUserId: true,
      kind: true,
      status: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      transcript: true,
      durationMs: true,
      retentionUntil: true,
      createdAt: true,
      updatedAt: true,
      contentDigest: true,
      storageProvider: true,
      storageStoreId: true,
      storagePath: true,
      conversation: {
        select: {
          ownerUserId: true,
          tenant: { select: { dataClassification: true } },
        },
      },
    },
  })
  const usage = await db.assistantUsageEvent.findMany({
    where: { actorUserId: userId },
    orderBy: { id: "asc" },
    take: limits.usage + 1,
    select: {
      actorUserId: true,
      provider: true,
      model: true,
      requestClass: true,
      inputTokens: true,
      cachedInputTokens: true,
      outputTokens: true,
      totalTokens: true,
      audioSeconds: true,
      imageCount: true,
      outcome: true,
      createdAt: true,
    },
  })
  const identities = await db.assistantWhatsAppIdentity.findMany({
    where: { userId },
    orderBy: { id: "asc" },
    take: limits.channelRows + 1,
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  const grants = await db.assistantWhatsAppGrant.findMany({
    where: { identity: { userId } },
    orderBy: { id: "asc" },
    take: limits.channelRows + 1,
    select: {
      identityId: true,
      tenantId: true,
      storeId: true,
      consentedAt: true,
      expiresAt: true,
      idleExpiresAt: true,
      revokedAt: true,
      updatedAt: true,
      identity: { select: { userId: true } },
      membership: { select: { userId: true } },
    },
  })
  const inbox = await db.assistantWhatsAppInbox.findMany({
    where: {
      OR: [{ identity: { userId } }, { binding: { identity: { userId } } }],
    },
    orderBy: { id: "asc" },
    take: limits.channelRows + 1,
    select: {
      id: true,
      kind: true,
      state: true,
      receivedAt: true,
      completedAt: true,
      updatedAt: true,
      identity: { select: { userId: true } },
      binding: {
        select: {
          identity: { select: { userId: true } },
          conversation: { select: { ownerUserId: true } },
        },
      },
    },
  })
  const outbox = await db.assistantWhatsAppOutbox.findMany({
    where: {
      inbox: {
        OR: [{ identity: { userId } }, { binding: { identity: { userId } } }],
      },
    },
    orderBy: { id: "asc" },
    take: limits.channelRows + 1,
    select: {
      id: true,
      inboxId: true,
      state: true,
      createdAt: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      updatedAt: true,
    },
  })
  return projectAssistantPrivateExport(
    {
      conversations,
      proposals,
      attachments,
      usage,
      identities,
      grants,
      inbox,
      outbox,
    },
    userId,
    now,
  )
}

/** Re-read after original object reads; callers must also recheck their real Session/privacy fence before sending. */
export async function validateAssistantPrivateExportSnapshot(
  db: AssistantPrivateExportClient,
  userId: string,
  snapshotDigest: string,
  options: { now?: Date } = {},
) {
  if (!/^[a-f0-9]{64}$/.test(snapshotDigest))
    throw new AssistantPrivateExportError("SCOPE_CHANGED")
  const fresh = await readAssistantPrivateExport(db, userId, options)
  if (fresh.snapshotDigest !== snapshotDigest)
    throw new AssistantPrivateExportError("SCOPE_CHANGED")
  return fresh
}
