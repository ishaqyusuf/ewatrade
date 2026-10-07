import type {
  AssistantAttachmentKind,
  Prisma,
} from "../../generated/prisma/client"
import type { AssistantScope } from "./assistant"
import type { DbClient } from "./types"

export class AssistantAttachmentError extends Error {
  constructor(
    readonly code:
      | "ATTACHMENT_LIMIT"
      | "ATTACHMENT_NOT_FOUND"
      | "ATTACHMENT_NOT_READY"
      | "ATTACHMENT_ALREADY_SENT"
      | "UPLOAD_EXPIRED",
    message: string,
  ) {
    super(message)
    this.name = "AssistantAttachmentError"
  }
}

const transactionOptions = { maxWait: 10_000, timeout: 30_000 }

const attachmentSelect = {
  id: true,
  conversationId: true,
  tenantId: true,
  storeId: true,
  actorUserId: true,
  messageId: true,
  kind: true,
  status: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  contentDigest: true,
  durationMs: true,
  storageProvider: true,
  storageStoreId: true,
  storagePath: true,
  transcript: true,
  extraction: true,
  errorCode: true,
  processingAttempts: true,
  uploadExpiresAt: true,
  processedAt: true,
  createdAt: true,
} satisfies Prisma.AssistantAttachmentSelect

export type AssistantAttachmentRecord = Prisma.AssistantAttachmentGetPayload<{
  select: typeof attachmentSelect
}>

/** Owner-scoped: the actor's own attachments in the active Store's conversation. */
function ownedWhere(scope: AssistantScope, attachmentId: string) {
  return {
    id: attachmentId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.userId,
  }
}

export async function createAssistantAttachmentIntent(
  db: DbClient,
  scope: AssistantScope,
  input: {
    conversationId: string
    kind: AssistantAttachmentKind
    fileName: string
    contentType: string
    sizeBytes: number
    contentDigest: string
    durationMs?: number | null
    maxPerConversation: number
    uploadWindowMs: number
    retentionMs: number
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const create = async (tx: Prisma.TransactionClient) => {
    const count = await tx.assistantAttachment.count({
      where: { conversationId: input.conversationId },
    })
    if (count >= input.maxPerConversation)
      throw new AssistantAttachmentError(
        "ATTACHMENT_LIMIT",
        "This setup already has the most files it can hold. Use Import for larger lists.",
      )
    return tx.assistantAttachment.create({
      data: {
        conversationId: input.conversationId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        actorUserId: scope.userId,
        kind: input.kind,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        contentDigest: input.contentDigest,
        durationMs: input.durationMs ?? null,
        uploadExpiresAt: new Date(now.getTime() + input.uploadWindowMs),
        retentionUntil: new Date(now.getTime() + input.retentionMs),
      },
      select: attachmentSelect,
    })
  }
  return "$transaction" in db
    ? db.$transaction(create, transactionOptions)
    : create(db)
}

export async function readAssistantAttachment(
  db: DbClient,
  scope: AssistantScope,
  attachmentId: string,
) {
  const attachment = await db.assistantAttachment.findFirst({
    where: ownedWhere(scope, attachmentId),
    select: attachmentSelect,
  })
  if (!attachment)
    throw new AssistantAttachmentError(
      "ATTACHMENT_NOT_FOUND",
      "This file is not available.",
    )
  return attachment
}

export async function listAssistantAttachments(
  db: DbClient,
  scope: AssistantScope,
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) return []
  return db.assistantAttachment.findMany({
    where: {
      id: { in: attachmentIds },
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.userId,
    },
    select: attachmentSelect,
  })
}

/** PENDING_UPLOAD → UPLOADED once; a replay of the same bytes is a no-op. */
export async function markAssistantAttachmentUploaded(
  db: DbClient,
  input: {
    attachmentId: string
    storageProvider: string
    storageStoreId: string | null
    storagePath: string
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const result = await db.assistantAttachment.updateMany({
    where: {
      id: input.attachmentId,
      status: "PENDING_UPLOAD",
      uploadExpiresAt: { gt: now },
    },
    data: {
      status: "UPLOADED",
      storageProvider: input.storageProvider,
      storageStoreId: input.storageStoreId,
      storagePath: input.storagePath,
    },
  })
  return result.count === 1
}

/**
 * Leases one attachment for processing: freshly uploaded ones, or a crashed
 * attempt whose lease expired. Returns null when nothing is claimable.
 */
export async function claimAssistantAttachmentProcessing(
  db: DbClient,
  input: {
    attachmentId: string
    leaseMs: number
    maxAttempts: number
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const result = await db.assistantAttachment.updateMany({
    where: {
      id: input.attachmentId,
      processingAttempts: { lt: input.maxAttempts },
      OR: [
        { status: "UPLOADED" },
        { status: "PROCESSING", leaseUntil: { lt: now } },
      ],
    },
    data: {
      status: "PROCESSING",
      leaseUntil: new Date(now.getTime() + input.leaseMs),
      processingAttempts: { increment: 1 },
    },
  })
  if (result.count !== 1) return null
  return db.assistantAttachment.findUnique({
    where: { id: input.attachmentId },
    select: attachmentSelect,
  })
}

export async function completeAssistantAttachmentProcessing(
  db: DbClient,
  input: {
    attachmentId: string
    transcript?: string | null
    extraction: Prisma.InputJsonValue
    durationMs?: number | null
    now?: Date
  },
) {
  const result = await db.assistantAttachment.updateMany({
    where: { id: input.attachmentId, status: "PROCESSING" },
    data: {
      status: "READY",
      transcript: input.transcript ?? null,
      extraction: input.extraction,
      ...(input.durationMs != null ? { durationMs: input.durationMs } : {}),
      errorCode: null,
      leaseUntil: null,
      processedAt: input.now ?? new Date(),
    },
  })
  return result.count === 1
}

/** Retryable failures go back to UPLOADED for the recovery pass. */
export async function failAssistantAttachmentProcessing(
  db: DbClient,
  input: { attachmentId: string; errorCode: string; retryable: boolean },
) {
  await db.assistantAttachment.updateMany({
    where: { id: input.attachmentId, status: "PROCESSING" },
    data: {
      status: input.retryable ? "UPLOADED" : "FAILED",
      errorCode: input.errorCode,
      leaseUntil: null,
    },
  })
}

/** Uploaded attachments whose processing never finished (crash, lost dispatch). */
export async function listAssistantAttachmentsToProcess(
  db: DbClient,
  input: { maxAttempts: number; limit?: number; now?: Date },
) {
  const now = input.now ?? new Date()
  return db.assistantAttachment.findMany({
    where: {
      processingAttempts: { lt: input.maxAttempts },
      OR: [
        { status: "UPLOADED" },
        { status: "PROCESSING", leaseUntil: { lt: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: input.limit ?? 10,
    select: { id: true },
  })
}

/**
 * Binds READY attachments to the message that sends them, inside the same
 * transaction as the message. Each attachment is sent at most once.
 */
export async function claimAssistantAttachmentsForMessage(
  db: DbClient,
  input: {
    conversationId: string
    actorUserId: string
    messageId: string
    attachmentIds: string[]
  },
) {
  if (input.attachmentIds.length === 0) return []
  const rows = await db.assistantAttachment.findMany({
    where: {
      id: { in: input.attachmentIds },
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
    },
    select: attachmentSelect,
  })
  if (rows.length !== input.attachmentIds.length)
    throw new AssistantAttachmentError(
      "ATTACHMENT_NOT_FOUND",
      "One of these files is not available.",
    )
  for (const row of rows) {
    if (row.status !== "READY")
      throw new AssistantAttachmentError(
        "ATTACHMENT_NOT_READY",
        "Wait until every file has been read, then send again.",
      )
    if (row.messageId && row.messageId !== input.messageId)
      throw new AssistantAttachmentError(
        "ATTACHMENT_ALREADY_SENT",
        "One of these files was already sent.",
      )
  }
  await db.assistantAttachment.updateMany({
    where: {
      id: { in: input.attachmentIds },
      OR: [{ messageId: null }, { messageId: input.messageId }],
    },
    data: { messageId: input.messageId },
  })
  const order = new Map(input.attachmentIds.map((id, index) => [id, index]))
  return rows.sort(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  )
}

/** Attachments sent in a conversation, for rebuilding model history. */
export async function readAssistantAttachmentsForConversation(
  db: DbClient,
  input: { conversationId: string; attachmentIds: string[] },
) {
  if (input.attachmentIds.length === 0) return []
  return db.assistantAttachment.findMany({
    where: {
      id: { in: input.attachmentIds },
      conversationId: input.conversationId,
      messageId: { not: null },
    },
    select: attachmentSelect,
  })
}

/**
 * An owner can drop a file before sending it; sent files stay as evidence.
 * Returns the removed row so the caller can delete its stored bytes.
 */
export async function removeAssistantAttachment(
  db: DbClient,
  scope: AssistantScope,
  attachmentId: string,
) {
  const remove = async (tx: Prisma.TransactionClient) => {
    const row = await tx.assistantAttachment.findFirst({
      where: { ...ownedWhere(scope, attachmentId), messageId: null },
      select: attachmentSelect,
    })
    if (!row) return null
    await tx.assistantAttachment.delete({ where: { id: row.id } })
    return row
  }
  return "$transaction" in db
    ? db.$transaction(remove, transactionOptions)
    : remove(db)
}

/** Sent files of a conversation, so the setup list can show where records came from. */
export async function listSentAssistantAttachments(
  db: DbClient,
  conversationId: string,
) {
  return db.assistantAttachment.findMany({
    where: { conversationId, messageId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      fileName: true,
      kind: true,
      contentType: true,
      errorCode: true,
    },
  })
}

/**
 * A sent attachment of this conversation, whoever uploaded it: any owner or
 * admin may add the shared setup list, including a product's photo.
 */
export async function readSentAssistantAttachment(
  db: DbClient,
  input: {
    tenantId: string
    storeId: string
    conversationId: string
    attachmentId: string
  },
) {
  return db.assistantAttachment.findFirst({
    where: {
      id: input.attachmentId,
      conversationId: input.conversationId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: "READY",
      messageId: { not: null },
    },
    select: attachmentSelect,
  })
}
