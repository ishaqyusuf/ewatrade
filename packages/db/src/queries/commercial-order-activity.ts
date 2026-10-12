import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import type {
  CommercialOrderAttachmentKind,
  CommercialOrderAttachmentStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog-errors"
import type { OrderScope } from "./order-visibility"
import { loadTenantActors } from "./tenant-actors"

export const ORDER_ACTIVITY_BODY_MAX_LENGTH = 2_000
export const ORDER_ACTIVITY_MAX_ATTACHMENTS = 6
/** Bytes must arrive within this window or the attachment is dropped from view. */
export const ORDER_ATTACHMENT_UPLOAD_WINDOW_MS = 30 * 60 * 1000

export type CommercialOrderAttachmentInput = {
  kind: CommercialOrderAttachmentKind
  contentType: string
  contentDigest: string
  sizeBytes: number
  originalFileName?: string
}

export type AddCommercialOrderActivityInput = {
  tenantId: string
  scope: OrderScope
  orderId: string
  actorUserId: string
  clientActivityId: string
  body?: string
  source?: "staff" | "assistant"
  attachments: CommercialOrderAttachmentInput[]
}

const attachmentSelect = {
  id: true,
  kind: true,
  status: true,
  contentType: true,
  sizeBytes: true,
  originalFileName: true,
  uploadExpiresAt: true,
  createdAt: true,
} satisfies Prisma.CommercialOrderAttachmentSelect

const activitySelect = {
  id: true,
  orderId: true,
  clientActivityId: true,
  payloadHash: true,
  actorUserId: true,
  body: true,
  source: true,
  createdAt: true,
  attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
} satisfies Prisma.CommercialOrderActivitySelect

type ActivityRow = Prisma.CommercialOrderActivityGetPayload<{
  select: typeof activitySelect
}>

function attachmentVisible(
  attachment: {
    status: CommercialOrderAttachmentStatus
    uploadExpiresAt: Date
  },
  now: Date,
) {
  return (
    attachment.status === "READY" ||
    attachment.uploadExpiresAt.getTime() > now.getTime()
  )
}

function serialize(row: ActivityRow, now = new Date()) {
  return {
    id: row.id,
    orderId: row.orderId,
    clientActivityId: row.clientActivityId,
    actorUserId: row.actorUserId,
    body: row.body,
    source: row.source,
    createdAt: row.createdAt,
    attachments: row.attachments
      .filter((attachment) => attachmentVisible(attachment, now))
      .map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        status: attachment.status,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        originalFileName: attachment.originalFileName,
      })),
  }
}

export type CommercialOrderActivityRecord = ReturnType<typeof serialize>

function hashPayload(
  input: AddCommercialOrderActivityInput,
  body: string | null,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        attachments: input.attachments.map((attachment) => [
          attachment.kind,
          attachment.contentType,
          attachment.contentDigest,
          attachment.sizeBytes,
        ]),
        body,
        orderId: input.orderId,
      }),
    )
    .digest("hex")
}

function validate(input: AddCommercialOrderActivityInput) {
  const body = input.body?.trim() || null
  if (body && body.length > ORDER_ACTIVITY_BODY_MAX_LENGTH)
    throw new CatalogError(
      "INVALID_ORDER",
      `Notes must be at most ${ORDER_ACTIVITY_BODY_MAX_LENGTH} characters.`,
    )
  if (!body && input.attachments.length === 0)
    throw new CatalogError(
      "INVALID_ORDER",
      "Write a note or attach a photo or file.",
    )
  if (input.attachments.length > ORDER_ACTIVITY_MAX_ATTACHMENTS)
    throw new CatalogError(
      "INVALID_ORDER",
      `Attach at most ${ORDER_ACTIVITY_MAX_ATTACHMENTS} files at a time.`,
    )
  const clientActivityId = input.clientActivityId.trim()
  if (clientActivityId.length < 8 || clientActivityId.length > 160)
    throw new CatalogError(
      "INVALID_ORDER",
      "A stable activity identity is required.",
    )
  for (const attachment of input.attachments) {
    if (
      !/^[a-f0-9]{64}$/.test(attachment.contentDigest) ||
      !Number.isSafeInteger(attachment.sizeBytes) ||
      attachment.sizeBytes < 1
    )
      throw new CatalogError("INVALID_ORDER", "A file could not be read.")
  }
  return { body, clientActivityId }
}

/** Appends a note and/or pending attachments; idempotent per client identity. */
export async function addCommercialOrderActivity(
  db: PrismaClient | Prisma.TransactionClient,
  input: AddCommercialOrderActivityInput,
) {
  const { body, clientActivityId } = validate(input)
  const payloadHash = hashPayload(input, body)
  const existing = await db.commercialOrderActivity.findUnique({
    select: activitySelect,
    where: {
      tenantId_clientActivityId: { clientActivityId, tenantId: input.tenantId },
    },
  })
  if (existing) {
    if (existing.payloadHash !== payloadHash)
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This activity identity was already used with different content.",
      )
    return serialize(existing)
  }
  const order = await db.commercialOrder.findFirst({
    select: { id: true },
    where: { ...input.scope, id: input.orderId, tenantId: input.tenantId },
  })
  if (!order)
    throw new CatalogError("ORDER_NOT_FOUND", "Commercial Order not found.")
  const uploadExpiresAt = new Date(
    Date.now() + ORDER_ATTACHMENT_UPLOAD_WINDOW_MS,
  )
  try {
    const created = await db.commercialOrderActivity.create({
      data: {
        actorUserId: input.actorUserId,
        attachments: {
          create: input.attachments.map((attachment) => ({
            contentDigest: attachment.contentDigest,
            contentType: attachment.contentType,
            kind: attachment.kind,
            orderId: order.id,
            originalFileName: attachment.originalFileName?.slice(0, 200),
            sizeBytes: attachment.sizeBytes,
            tenantId: input.tenantId,
            uploadExpiresAt,
          })),
        },
        body,
        clientActivityId,
        orderId: order.id,
        payloadHash,
        source: input.source ?? "staff",
        tenantId: input.tenantId,
      },
      select: activitySelect,
    })
    return serialize(created)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return addCommercialOrderActivity(db, input)
    throw error
  }
}

export async function listCommercialOrderActivity(
  db: PrismaClient,
  input: { tenantId: string; scope: OrderScope; orderId: string },
) {
  const order = await db.commercialOrder.findFirst({
    select: { id: true },
    where: { ...input.scope, id: input.orderId, tenantId: input.tenantId },
  })
  if (!order)
    throw new CatalogError("ORDER_NOT_FOUND", "Commercial Order not found.")
  const rows = await db.commercialOrderActivity.findMany({
    orderBy: { createdAt: "asc" },
    select: activitySelect,
    where: { orderId: order.id, tenantId: input.tenantId },
  })
  const actors = await loadTenantActors(db, {
    tenantId: input.tenantId,
    userIds: rows.map((row) => row.actorUserId),
  })
  const now = new Date()
  return rows.map((row) => ({
    ...serialize(row, now),
    actor: actors.get(row.actorUserId) ?? null,
  }))
}

/** Upload and preview lookups, scoped to what the caller may see. */
export async function readCommercialOrderAttachment(
  db: PrismaClient,
  input: { tenantId: string; scope: OrderScope; attachmentId: string },
) {
  const row = await db.commercialOrderAttachment.findFirst({
    where: {
      id: input.attachmentId,
      order: { ...input.scope },
      tenantId: input.tenantId,
    },
  })
  if (!row) throw new CatalogError("ORDER_NOT_FOUND", "Attachment not found.")
  return row
}

/** Returns false when the upload window closed or it was already stored. */
export async function markCommercialOrderAttachmentUploaded(
  db: PrismaClient,
  input: {
    attachmentId: string
    tenantId: string
    storageProvider: string
    storageStoreId: string | null
    storagePath: string
  },
) {
  const now = new Date()
  const { count } = await db.commercialOrderAttachment.updateMany({
    data: {
      status: "READY",
      storagePath: input.storagePath,
      storageProvider: input.storageProvider,
      storageStoreId: input.storageStoreId,
      uploadedAt: now,
    },
    where: {
      id: input.attachmentId,
      status: "PENDING_UPLOAD",
      tenantId: input.tenantId,
      uploadExpiresAt: { gt: now },
    },
  })
  return count === 1
}

/**
 * Records a file that already exists elsewhere (e.g. a receipt sent to the
 * assistant) as an Order activity entry. `store` copies the bytes under the
 * new attachment id; the caller's transaction keeps row and copy together.
 */
export async function addStoredFileToCommercialOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    scope: OrderScope
    orderId: string
    actorUserId: string
    clientActivityId: string
    body?: string
    source: "staff" | "assistant"
    file: CommercialOrderAttachmentInput
    store: (attachmentId: string) => Promise<{
      storagePath: string
      storageProvider: string
      storageStoreId: string | null
    }>
  },
) {
  const existing = await tx.commercialOrderActivity.findUnique({
    select: activitySelect,
    where: {
      tenantId_clientActivityId: {
        clientActivityId: input.clientActivityId,
        tenantId: input.tenantId,
      },
    },
  })
  if (existing) return serialize(existing)
  const order = await tx.commercialOrder.findFirst({
    select: { id: true },
    where: { ...input.scope, id: input.orderId, tenantId: input.tenantId },
  })
  if (!order)
    throw new CatalogError("ORDER_NOT_FOUND", "Commercial Order not found.")
  const body = input.body?.trim() || null
  if (body && body.length > ORDER_ACTIVITY_BODY_MAX_LENGTH)
    throw new CatalogError(
      "INVALID_ORDER",
      `Notes must be at most ${ORDER_ACTIVITY_BODY_MAX_LENGTH} characters.`,
    )
  const now = new Date()
  const activity = await tx.commercialOrderActivity.create({
    data: {
      actorUserId: input.actorUserId,
      body,
      clientActivityId: input.clientActivityId,
      orderId: order.id,
      payloadHash: hashPayload(
        {
          ...input,
          attachments: [input.file],
        },
        body,
      ),
      source: input.source,
      tenantId: input.tenantId,
    },
    select: { id: true },
  })
  const attachment = await tx.commercialOrderAttachment.create({
    data: {
      activityId: activity.id,
      contentDigest: input.file.contentDigest,
      contentType: input.file.contentType,
      kind: input.file.kind,
      orderId: order.id,
      originalFileName: input.file.originalFileName?.slice(0, 200),
      sizeBytes: input.file.sizeBytes,
      tenantId: input.tenantId,
      uploadExpiresAt: now,
    },
    select: { id: true },
  })
  const stored = await input.store(attachment.id)
  await tx.commercialOrderAttachment.update({
    data: { ...stored, status: "READY", uploadedAt: new Date() },
    where: { id: attachment.id },
  })
  return serialize(
    await tx.commercialOrderActivity.findUniqueOrThrow({
      select: activitySelect,
      where: { id: activity.id },
    }),
  )
}
