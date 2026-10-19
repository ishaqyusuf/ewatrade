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

export type CustodySource = {
  custodyType: "STORE" | "STAFF" | "SESSION" | "TRANSIT"
  custodyReferenceId: string
}

/**
 * The supported moves: Store → staff assignment and staff → same-Store
 * return. Everything else is refused with a reason; session and transit
 * custody stay with their own workflows.
 */
export function custodyMoveKind(
  source: CustodySource,
  target: StockCustodyMove["target"],
):
  | { kind: "assignment"; staffUserId: string }
  | { kind: "return"; staffUserId: string }
  | { refused: string } {
  if (source.custodyType === "SESSION" || source.custodyType === "TRANSIT")
    return {
      refused:
        "Session and transit stock move through their own closeout and transfer steps.",
    }
  if (source.custodyType === "STORE")
    return target.type === "staff"
      ? { kind: "assignment", staffUserId: target.userId }
      : { refused: "This stock is already in Store custody." }
  // Source is a staff member's custody.
  if (target.type === "store")
    return { kind: "return", staffUserId: source.custodyReferenceId }
  return target.userId === source.custodyReferenceId
    ? { refused: "This stock is already with that staff member." }
    : {
        refused:
          "Stock moves between staff only through the Store: return it first, then assign it.",
      }
}
