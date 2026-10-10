import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const reason = z.string().trim().min(1).max(500)
const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((value) => /[1-9]/.test(value), "Quantity must be positive")

export const stockTransferDispatchAction = z
  .object({
    action: z.literal("stock_transfer_dispatch"),
    sourceBalanceSourceId: id,
    targetStoreId: id,
    quantity,
    reason,
  })
  .strict()

// Confirmation must occur in the destination Store; the app supplies the actor.
export const stockTransferReceiveAction = z
  .object({
    action: z.literal("stock_transfer_receive"),
    transferId: id,
    quantity,
    reason,
  })
  .strict()

// Cancellation returns all outstanding transit, calculated by the domain command.
export const stockTransferCancelAction = z
  .object({
    action: z.literal("stock_transfer_cancel"),
    transferId: id,
    reason,
  })
  .strict()
