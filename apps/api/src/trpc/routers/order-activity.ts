import {
  CatalogError,
  ORDER_ACTIVITY_BODY_MAX_LENGTH,
  ORDER_ACTIVITY_MAX_ATTACHMENTS,
  addCommercialOrderActivity,
  listCommercialOrderActivity,
} from "@ewatrade/db/queries"
import {
  ORDER_ATTACHMENT_MAX_BYTES,
  orderAttachmentKind,
} from "@ewatrade/private-media/order-attachments"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../init"
import { orderScope } from "../order-scope"
import { assertCanOperateOrders } from "./orders"

const attachmentInputSchema = z
  .object({
    contentType: z.string().trim().min(1).max(100),
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive().max(ORDER_ATTACHMENT_MAX_BYTES),
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
            message: "Attach a photo (JPG, PNG, WebP, HEIC) or a PDF.",
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
})
