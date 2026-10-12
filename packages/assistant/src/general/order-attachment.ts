import { z } from "zod"

const id = z.string().trim().min(1).max(128)

/**
 * Adds to an order's Notes & photos: a photo or PDF the user sent in this
 * chat (e.g. a receipt), a note, or both. One of the two is required.
 */
export const orderAttachmentAddAction = z
  .object({
    action: z.literal("order_attachment_add"),
    orderId: id,
    attachmentId: id.optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict()
