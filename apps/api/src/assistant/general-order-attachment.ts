import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { listAssistantAttachments } from "@ewatrade/db/assistant-attachments"
import {
  addCommercialOrderActivity,
  addStoredFileToCommercialOrderInTransaction,
  resolveOrderScope,
} from "@ewatrade/db/queries"
import {
  createOrderAttachmentStorage,
  orderAttachmentKind,
} from "@ewatrade/private-media/order-attachments"
import { TRPCError } from "@trpc/server"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "./attachment-storage"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

type AttachAction = Extract<GeneralAction, { action: "order_attachment_add" }>

/** The sent file, when the entry has one; a note alone needs none. */
async function sentFile(
  ctx: GeneralTransactionContext,
  scope: ReturnType<typeof requireGeneralScope>,
  attachmentId: string,
) {
  const [attachment] = await listAssistantAttachments(ctx.db, scope, [
    attachmentId,
  ])
  if (
    !attachment ||
    !attachment.messageId ||
    attachment.status !== "READY" ||
    !attachment.storagePath ||
    attachment.retentionUntil.getTime() <= Date.now()
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That file is no longer available. Send it again.",
    })
  const kind = orderAttachmentKind(attachment.contentType)
  if (!kind)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only photos and PDFs can be attached to an order.",
    })
  return { attachment, kind }
}

async function current(ctx: GeneralTransactionContext, payload: AttachAction) {
  const scope = requireGeneralScope(ctx)
  if (!payload.attachmentId && !payload.note?.trim())
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Say what to note on the order, or send the file to attach.",
    })
  const file = payload.attachmentId
    ? await sentFile(ctx, scope, payload.attachmentId)
    : null
  const visibility = await resolveOrderScope(ctx.db, {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    activeStoreId: scope.storeId,
    userId: scope.userId,
    role: ctx.tenantContext.membership.role,
    allowedStoreIds: ctx.tenantContext.stores.map((store) => store.id),
  })
  const order = await ctx.db.commercialOrder.findFirst({
    where: { ...visibility, id: payload.orderId },
    select: { id: true, orderNumber: true, customerName: true },
  })
  if (!order)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This order is unavailable in your current Store.",
    })
  return {
    file,
    order,
    scope,
    visibility,
    // Notes never edit the order, so only the file's readiness matters.
    target: file
      ? { id: file.attachment.id, revision: file.attachment.contentDigest }
      : { id: order.id, revision: "note" },
  }
}

export const orderAttachmentAdd = {
  stale: "That file or order changed. Review it again.",
  unavailable: "This can't be added to the order right now.",
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { file, order, target } = await current(ctx, payload)
    const customer = order.customerName || "Walk-in customer"
    return {
      target,
      lines: [
        file
          ? `Attach this ${file.kind === "IMAGE" ? "photo" : "file"} to ${order.orderNumber} · ${customer}`
          : `Add a note to ${order.orderNumber} · ${customer}`,
        ...(payload.note ? [`Note: ${payload.note}`] : []),
        "Adds it to the order's Notes & photos. The order's items, totals and payments do not change.",
      ],
    }
  },
  async execute(ctx, payload, key) {
    const { file, order, scope, visibility } = await current(ctx, payload)
    if (!file) {
      await addCommercialOrderActivity(ctx.db, {
        actorUserId: scope.userId,
        attachments: [],
        body: payload.note,
        clientActivityId: key,
        orderId: order.id,
        scope: visibility,
        source: "assistant",
        tenantId: scope.tenantId,
      })
      return {
        kind: "order" as const,
        recordId: order.id,
        orderId: order.id,
        title: "Note added",
        detail: `Added to ${order.orderNumber}'s Notes & photos.`,
      }
    }
    const { attachment, kind } = file
    const bytes = await setupAttachmentStorage(scope.dataClassification).read({
      target: setupAttachmentTarget(attachment),
    })
    await addStoredFileToCommercialOrderInTransaction(ctx.db, {
      actorUserId: scope.userId,
      body: payload.note,
      clientActivityId: key,
      file: {
        contentDigest: attachment.contentDigest,
        contentType: attachment.contentType,
        kind,
        originalFileName: attachment.fileName,
        sizeBytes: attachment.sizeBytes,
      },
      orderId: order.id,
      scope: visibility,
      source: "assistant",
      store: async (attachmentId) => {
        const storage = createOrderAttachmentStorage(scope.dataClassification)
        const { storagePath } = await storage.stage({
          bytes,
          target: {
            attachmentId,
            contentDigest: attachment.contentDigest,
            contentType: attachment.contentType,
            orderId: order.id,
            sizeBytes: attachment.sizeBytes,
            tenantId: scope.tenantId,
          },
        })
        return {
          storagePath,
          storageProvider: storage.provider,
          storageStoreId: storage.storeId,
        }
      },
      tenantId: scope.tenantId,
    })
    return {
      kind: "order" as const,
      recordId: order.id,
      orderId: order.id,
      // Camera file names are random; the card shows the photo itself.
      title: kind === "IMAGE" ? "Photo attached" : "File attached",
      detail: `Added to ${order.orderNumber}'s Notes & photos.`,
    }
  },
} satisfies GeneralActionAdapter<AttachAction>
