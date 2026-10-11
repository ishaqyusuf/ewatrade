import { z } from "zod"

const id = z.string().trim().min(1).max(128)

/** Files a photo or PDF the user sent in this chat (e.g. a receipt) on an order. */
export const orderAttachmentAddAction = z
  .object({
    action: z.literal("order_attachment_add"),
    orderId: id,
    attachmentId: id,
    note: z.string().trim().max(500).optional(),
  })
  .strict()
