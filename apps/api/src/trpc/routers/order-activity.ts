import {
  CatalogError,
  ORDER_ACTIVITY_BODY_MAX_LENGTH,
  ORDER_ACTIVITY_MAX_ATTACHMENTS,
  addCommercialOrderActivity,
  listCommercialOrderActivity,
  markCommercialOrderAttachmentUploaded,
  readCommercialOrderAttachment,
} from "@ewatrade/db/queries"
import { PrivateObjectStorageError } from "@ewatrade/private-media/object-storage"
import {
  ORDER_VIDEO_MAX_BYTES,
  orderAttachmentKind,
  orderAttachmentMaxBytes,
} from "@ewatrade/private-media/order-attachments"
import { createOrderVideoStorage } from "@ewatrade/private-media/order-videos"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../init"
import { orderScope } from "../order-scope"
import { assertCanOperateOrders } from "./orders"

const attachmentInputSchema = z
  .object({
    contentType: z.string().trim().min(1).max(100),
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive().max(ORDER_VIDEO_MAX_BYTES),
    fileName: z.string().trim().max(200).optional(),
  })
  .strict()

export const orderActivityAddSchema = z
  .object({
    orderId: z.string().trim().min(1),
    clientActivityId: z.string().trim().min(8).max(160),
    body: z.string().trim().max(ORDER_ACTIVITY_BODY_MAX_LENGTH).optional(),
    attachments: z
      .array(attachmentInputSchema)
      .max(ORDER_ACTIVITY_MAX_ATTACHMENTS)
      .default([]),
  })
  .strict()

function activityError(error: unknown): never {
  if (error instanceof PrivateObjectStorageError)
    throw new TRPCError({
      cause: error,
      code:
        error.code === "INTEGRITY_MISMATCH"
          ? "BAD_REQUEST"
          : "PRECONDITION_FAILED",
      message:
        error.code === "INTEGRITY_MISMATCH"
          ? "The file didn't arrive complete. Attach it again."
          : "Files can't be saved right now. Try again in a moment.",
    })
  if (error instanceof CatalogError)
    throw new TRPCError({
      cause: error,
      code:
        error.code === "ORDER_NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "IDEMPOTENCY_MISMATCH"
            ? "CONFLICT"
            : "BAD_REQUEST",
      message: error.message,
    })
  throw error
}

/** Notes, photos and documents staff add to an Order over time. */
export const orderActivityRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ orderId: z.string().trim().min(1) }).strict())
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await listCommercialOrderActivity(ctx.db, {
          orderId: input.orderId,
          scope: await orderScope(ctx),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        activityError(error)
      }
    }),

  /** Creates the entry; each returned attachment id then receives its bytes by PUT. */
  add: protectedProcedure
    .input(orderActivityAddSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const attachments = input.attachments.map((attachment) => {
        const kind = orderAttachmentKind(attachment.contentType)
        if (!kind)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Attach a photo (JPG, PNG, WebP, HEIC), a PDF or a video (MP4, MOV).",
          })
        if (
          attachment.sizeBytes > orderAttachmentMaxBytes(attachment.contentType)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              kind === "VIDEO"
                ? "Videos can be up to 100 MB. Record a shorter one."
                : "Files can be up to 10 MB.",
          })
        return {
          contentDigest: attachment.contentDigest,
          contentType: attachment.contentType,
          kind,
          originalFileName: attachment.fileName,
          sizeBytes: attachment.sizeBytes,
        }
      })
      try {
        return await addCommercialOrderActivity(ctx.db, {
          actorUserId: ctx.session.user.id,
          attachments,
          body: input.body,
          clientActivityId: input.clientActivityId,
          orderId: input.orderId,
          scope: await orderScope(ctx),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        activityError(error)
      }
    }),

  /**
   * Where a pending file's bytes go. On live data every file uploads straight
   * to private storage with a token for that one object (Vercel caps request
   * bodies near 4.5 MB), then calls confirmUpload; QA files go to the API
   * upload route.
   */
  uploadTarget: protectedProcedure
    .input(z.object({ attachmentId: z.string().trim().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        const row = await pendingAttachment(ctx, input.attachmentId)
        const api = {
          mode: "api" as const,
          path: `/api/orders/attachments/${row.id}/upload`,
        }
        const storage = createOrderVideoStorage(
          ctx.tenantContext.tenant.dataClassification,
        )
        if (storage.mode === "api") return api
        return {
          mode: "direct" as const,
          ...(await storage.uploadToken(uploadTarget(row))),
          contentType: row.contentType,
        }
      } catch (error) {
        activityError(error)
      }
    }),

  /** After a direct upload: the stored file must be the promised one. */
  confirmUpload: protectedProcedure
    .input(z.object({ attachmentId: z.string().trim().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        const row = await pendingAttachment(ctx, input.attachmentId)
        const storage = createOrderVideoStorage(
          ctx.tenantContext.tenant.dataClassification,
        )
        if (storage.mode !== "direct")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This file is uploaded through the app.",
          })
        const { storagePath } = await storage.confirm(uploadTarget(row))
        const saved = await markCommercialOrderAttachmentUploaded(ctx.db, {
          attachmentId: row.id,
          storagePath,
          storageProvider: storage.provider,
          storageStoreId: storage.storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
        if (!saved)
          throw new TRPCError({
            code: "CONFLICT",
            message: "This upload expired. Attach the video again.",
          })
        return { attachmentId: row.id, status: "READY" as const }
      } catch (error) {
        activityError(error)
      }
    }),
})

type ActivityContext = Parameters<typeof orderScope>[0]

async function pendingAttachment(ctx: ActivityContext, attachmentId: string) {
  const row = await readCommercialOrderAttachment(ctx.db, {
    attachmentId,
    scope: await orderScope(ctx),
    tenantId: ctx.tenantContext.tenant.id,
  })
  if (row.status !== "PENDING_UPLOAD" || row.uploadExpiresAt <= new Date())
    throw new TRPCError({
      code: "CONFLICT",
      message:
        row.status === "READY"
          ? "This file is already saved."
          : "This upload expired. Attach the file again.",
    })
  return row
}

function uploadTarget(row: {
  id: string
  tenantId: string
  orderId: string
  contentDigest: string
  contentType: string
  sizeBytes: number
}) {
  return {
    attachmentId: row.id,
    contentDigest: row.contentDigest,
    contentType: row.contentType,
    orderId: row.orderId,
    sizeBytes: row.sizeBytes,
    tenantId: row.tenantId,
  }
}
