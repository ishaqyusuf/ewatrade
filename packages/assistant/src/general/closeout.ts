import { z } from "zod"
const id = z.string().trim().min(1).max(128)
const reason = z.string().trim().min(1).max(500)
export const closeoutCreateAction = z
  .object({
    action: z.literal("inventory_closeout_create"),
    custodyType: z.enum(["staff", "session"]),
    custodyReferenceId: id,
    declarations: z
      .array(
        z
          .object({
            balanceSourceId: id,
            declaredQuantity: z.string().regex(/^\d{1,12}(\.\d{1,6})?$/),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    reason,
  })
  .strict()
export const closeoutFinalizeAction = z
  .object({
    action: z.literal("inventory_closeout_finalize"),
    closeoutId: id,
    reason,
  })
  .strict()
