import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { listAssistantAttachments } from "@ewatrade/db/assistant-attachments"
import {
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

async function current(ctx: GeneralTransactionContext, payload: AttachAction) {
  const scope = requireGeneralScope(ctx)
  const [attachment] = await listAssistantAttachments(ctx.db, scope, [
    payload.attachmentId,
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
    attachment,
    kind,
    order,
    scope,
    visibility,
    // Attaching never edits the order, so only the file's readiness matters.
    target: { id: attachment.id, revision: attachment.contentDigest },
  }
}

export const orderAttachmentAdd = {
  stale: "That file or order changed. Review the attachment again.",
  unavailable: "This file can't be attached right now.",
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { attachment, order, target } = await current(ctx, payload)
    return {
      target,
      lines: [
        `Attach ${attachment.fileName} to ${order.orderNumber} · ${order.customerName || "Walk-in customer"}`,
        ...(payload.note ? [`Note: ${payload.note}`] : []),
        "Adds it to the order's Notes & photos. The order's items, totals and payments do not change.",
      ],
    }
  },
  async execute(ctx, payload, key) {
    const { attachment, kind, order, scope, visibility } = await current(
      ctx,
      payload,
    )
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
      title: "File attached",
      detail: `${attachment.fileName} added to ${order.orderNumber}'s Notes & photos.`,
    }
  },
} satisfies GeneralActionAdapter<AttachAction>
