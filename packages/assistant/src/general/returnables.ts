import { z } from "zod"
import { serviceNameKey } from "./service-job-draft"

const id = z.string().trim().min(1).max(128)
/** Mirrors `RETURNABLE_MOVEMENT_MAX_QUANTITY` in the returnables ledger. */
export const RETURNABLE_QUANTITY_MAX = 100_000
/** Mirrors `ORDER_RETURNABLES_MAX`: different returnable items on one order. */
export const ORDER_RETURNABLES_MAX = 10
const wholeQuantity = z
  .number()
  .int("Returnables are counted in whole items")
  .min(1)
  .max(RETURNABLE_QUANTITY_MAX)

/** Crates, cylinders or bottles the owner said go out with a new order. */
export const orderReturnableRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .describe(
        "The returnable item as said, e.g. 'crates' or 'gas cylinder'; not the product sold.",
      ),
    quantity: wholeQuantity,
  })
  .strict()
export type OrderReturnableRequest = z.infer<
  typeof orderReturnableRequestSchema
>

export const orderReturnableResolutionSchema = z
  .object({
    name: z.string().max(160),
    quantity: wholeQuantity,
    status: z.enum(["resolved", "not_set_up", "missing_item", "ambiguous"]),
    catalogItemId: id.optional(),
    itemName: z.string().max(160).optional(),
    issue: z.string().max(300).optional(),
  })
  .strict()
export type OrderReturnableResolution = z.infer<
  typeof orderReturnableResolutionSchema
>

/**
 * A returnable going out with `order_create`. The server binds `name` to a
 * Returnable catalog item while preparing; Confirm needs that `catalogItemId`.
 */
export const orderReturnableLineSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    quantity: wholeQuantity,
    catalogItemId: id.optional(),
  })
  .strict()

export const RETURNABLE_NOT_SET_UP_ISSUE =
  "No Returnable item is set up yet. Add one (for example Egg crate) first, or note it on the order."

/**
 * Matches what the owner called the returnable ("58 crates") to one item set up
 * as Returnable. Exact names win; otherwise a word match on one item; with only
 * one Returnable item, a plain "crates"/"cylinders" still has to share a word.
 */
export function resolveReturnableName<T extends { id: string; name: string }>(
  name: string,
  items: ReadonlyArray<T>,
):
  | { status: "resolved"; item: T }
  | { status: "not_set_up" | "missing_item" | "ambiguous" } {
  if (!items.length) return { status: "not_set_up" }
  const wanted = serviceNameKey(name)
  const exact = items.filter((item) => serviceNameKey(item.name) === wanted)
  if (exact.length === 1 && exact[0])
    return { status: "resolved", item: exact[0] }
  if (exact.length > 1) return { status: "ambiguous" }
  const words = new Set(wanted.split(" ").filter(Boolean))
  const sharing = items.filter((item) =>
    serviceNameKey(item.name)
      .split(" ")
      .some((word) => words.has(word)),
  )
  if (sharing.length === 1 && sharing[0])
    return { status: "resolved", item: sharing[0] }
  return { status: sharing.length > 1 ? "ambiguous" : "missing_item" }
}

/** Pure order-side resolution; callers pass the business's Returnable items. */
export function resolveOrderReturnables(
  requested: readonly OrderReturnableRequest[],
  items: ReadonlyArray<{ id: string; name: string }>,
): { returnables: OrderReturnableResolution[]; issues: string[] } {
  const returnables = requested.map((entry): OrderReturnableResolution => {
    const match = resolveReturnableName(entry.name, items)
    if (match.status === "resolved")
      return {
        name: entry.name,
        quantity: entry.quantity,
        status: "resolved",
        catalogItemId: match.item.id,
        itemName: match.item.name,
      }
    return {
      name: entry.name,
      quantity: entry.quantity,
      status: match.status,
      issue:
        match.status === "not_set_up"
          ? RETURNABLE_NOT_SET_UP_ISSUE
          : match.status === "ambiguous"
            ? `More than one Returnable item matches “${entry.name}”. Choose the exact one.`
            : `No Returnable item matches “${entry.name}”. Choose a Returnable item or add one.`,
    }
  })
  const issues = returnables.flatMap((entry) =>
    entry.issue ? [`${entry.quantity} ${entry.name}: ${entry.issue}`] : [],
  )
  const ids = returnables.flatMap((entry) =>
    entry.catalogItemId ? [entry.catalogItemId] : [],
  )
  if (new Set(ids).size !== ids.length)
    issues.push("Each Returnable item can be listed once per order.")
  if (requested.length > ORDER_RETURNABLES_MAX)
    issues.push(
      `An order can send out at most ${ORDER_RETURNABLES_MAX} Returnable items.`,
    )
  return { returnables, issues: [...new Set(issues)] }
}

/** "70% paid" as an exact amount once the total is known; half a kobo rounds down. */
export function percentOfTotalMinor(totalMinor: number, percent: number) {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return null
  return Math.floor((totalMinor * percent) / 100)
}

export const returnableMovementKinds = [
  "RETURNED",
  "WRITTEN_OFF",
  "ISSUED",
] as const
export const returnableMovementKindLabels = {
  RETURNED: "returned",
  WRITTEN_OFF: "written off",
  ISSUED: "went out",
} as const satisfies Record<(typeof returnableMovementKinds)[number], string>

/**
 * One ledger entry for a customer's returnables: back, lost (written off) or a
 * correction that more went out. Names are resolved to saved records before
 * review; the ids are what Confirm records.
 */
export const returnableMovementRecordAction = z
  .object({
    action: z.literal("returnable_movement_record"),
    kind: z.enum(returnableMovementKinds),
    quantity: wholeQuantity,
    customerId: id.optional(),
    customerName: z.string().trim().min(1).max(160).optional(),
    orderId: id.optional(),
    orderNumber: z.string().trim().min(1).max(40).optional(),
    catalogItemId: id.optional(),
    itemName: z.string().trim().min(1).max(160).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
export type ReturnableMovementRecordAction = z.infer<
  typeof returnableMovementRecordAction
>

/** Draft summary for clients without a presentation. */
export function returnableMovementSummary(
  action: ReturnableMovementRecordAction,
) {
  const item = action.itemName ?? "returnable items"
  return [
    `${action.quantity} ${item} ${returnableMovementKindLabels[action.kind]}`,
    action.customerName ? `Customer: ${action.customerName}` : null,
    action.orderNumber ? `Order: ${action.orderNumber}` : null,
    action.note ? `Note: ${action.note}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * What still blocks returnables on an `order_create` draft. Prepared drafts
 * already carry their name issues, so only the confirm-time facts are added.
 */
export function orderReturnableIssues(order: {
  customerId?: string
  returnables?: ReadonlyArray<{
    name: string
    quantity: number
    catalogItemId?: string
  }>
  prepared?: { returnables?: unknown }
}): string[] {
  const returnables = order.returnables ?? []
  if (!returnables.length) return []
  const issues: string[] = []
  // A prepared draft already names unmatched items and an unsaved customer.
  const prepared = Boolean(order.prepared?.returnables)
  if (!prepared)
    for (const entry of returnables)
      if (!entry.catalogItemId)
        issues.push(
          `${entry.quantity} ${entry.name}: choose a Returnable item, or add one first.`,
        )
  if (!order.customerId && !prepared)
    issues.push(
      "Returnables can't go out on a walk-in sale. Choose a saved customer, or sell without returnables.",
    )
  const ids = returnables.flatMap((entry) =>
    entry.catalogItemId ? [entry.catalogItemId] : [],
  )
  if (new Set(ids).size !== ids.length)
    issues.push("Each Returnable item can be listed once per order.")
  return issues
}

/** "To come back: 58 Egg crate · Musa holds 12 → 70" (channel review line). */
export function orderReturnableReviewLine(entry: {
  name: string
  quantity: number
  customerName: string
  heldBefore: number
}) {
  return `To come back: ${entry.quantity} ${entry.name} · ${entry.customerName} holds ${entry.heldBefore} → ${entry.heldBefore + entry.quantity}`
}
