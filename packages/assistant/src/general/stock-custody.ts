import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const reason = z.string().trim().min(1).max(500)
const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((value) => /[1-9]/.test(value), "Quantity must be positive")

/**
 * Move Store stock into a staff member's custody, or return a staff member's
 * stock to the same Store. The app supplies the Tenant, Store and actor;
 * the staff member is an exact saved user identity, never a name.
 */
export const stockCustodyMoveAction = z
  .object({
    action: z.literal("stock_custody_move"),
    sourceBalanceSourceId: id,
    target: z.discriminatedUnion("type", [
      z.object({ type: z.literal("store") }).strict(),
      z.object({ type: z.literal("staff"), userId: id }).strict(),
    ]),
    quantity,
    reason,
  })
  .strict()
export type StockCustodyMove = z.infer<typeof stockCustodyMoveAction>
