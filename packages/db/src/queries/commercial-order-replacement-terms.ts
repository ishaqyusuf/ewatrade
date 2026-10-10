import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { z } from "zod"
import { CatalogError } from "./catalog-errors"

const moneySchema = z.number().int().min(0).max(100_000_000)
export const orderReplacementChangesSchema = z
  .array(
    z
      .object({
        orderLineId: z.string().trim().min(1).max(128),
        quantity: z.string().max(64).optional(),
        unitPriceMinor: moneySchema.optional(),
        enteredTotalMinor: moneySchema.optional(),
      })
      .strict()
      .refine(
        (row) =>
          row.quantity !== undefined ||
          row.unitPriceMinor !== undefined ||
          row.enteredTotalMinor !== undefined,
        "Choose a quantity or price change.",
      ),
  )
  .min(1)
  .max(500)
export type OrderReplacementChanges = z.input<
  typeof orderReplacementChangesSchema
>
export type ReplacementSourceLine = {
  id: string
  offeringId: string
  quantity: { toString(): string }
  unitPriceMinor: number | null
  totalMinor: number
  discountMinor: number
  taxMinor: number
  snapshot: null | {
    pricingPolicy: string
    quantity: { toString(): string }
    unitPriceMinor: number | null
    totalMinor: number
    transactionScale: number | null
  }
}
function invalid(message: string): never {
  throw new CatalogError("INVALID_ORDER", message)
}
function money(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000)
    invalid(
      "Replacement amounts must be supported nonnegative minor-unit amounts.",
    )
  return value
}
/** Pure candidate terms only. Eligibility, live availability and authority are separate checks. */
export function buildOrderReplacementTerms(
  source: {
    lines: ReplacementSourceLine[]
    subtotalMinor: number
    discountMinor: number
    taxMinor: number
    serviceChargeMinor: number
    totalMinor: number
  },
  input: OrderReplacementChanges,
) {
  const parsed = orderReplacementChangesSchema.safeParse(input)
  if (!parsed.success)
    invalid(parsed.error.issues[0]?.message ?? "Invalid replacement changes.")
  const changes = new Map(parsed.data.map((row) => [row.orderLineId, row]))
  if (changes.size !== parsed.data.length)
    invalid("An order line may only be changed once.")
  if (
    !source.lines.length ||
    source.lines.length > 500 ||
    new Set(source.lines.map((row) => row.id)).size !== source.lines.length
  )
    invalid("Complete distinct order lines are required.")
  for (const id of changes.keys())
    if (!source.lines.some((line) => line.id === id))
      invalid("Replacement selected a line outside this order.")
  let changed = false
  const lines = source.lines.map((line) => {
    const snapshot = line.snapshot
    if (
      !snapshot ||
      snapshot.quantity.toString() !== line.quantity.toString() ||
      snapshot.unitPriceMinor !== line.unitPriceMinor ||
      snapshot.totalMinor !== line.totalMinor
    )
      invalid("Original line pricing evidence is inconsistent.")
    // These fields have no canonical line-level adjustment command yet.
    if (line.discountMinor !== 0 || line.taxMinor !== 0)
      invalid(
        "Line-level tax or discount requires its owning correction workflow.",
      )
    if (!["FIXED", "ORDER_TOTAL"].includes(snapshot.pricingPolicy))
      invalid("Quote pricing requires its owning quote correction workflow.")
    if (
      snapshot.pricingPolicy === "FIXED" &&
      (line.unitPriceMinor === null ||
        multiplyExactDecimals(
          String(line.unitPriceMinor),
          line.quantity.toString(),
        ) !== String(line.totalMinor))
    )
      invalid("Original unit-price total needs reconciliation.")
    const change = changes.get(line.id)
    let quantity: string
    try {
      quantity = parseExactDecimal(
        change?.quantity ?? line.quantity.toString(),
        { allowZero: false, maxScale: snapshot.transactionScale ?? 6 },
      )
    } catch (error) {
      invalid(error instanceof Error ? error.message : "Invalid quantity.")
    }
    let unitPriceMinor = line.unitPriceMinor
    let totalMinor = line.totalMinor
    if (snapshot.pricingPolicy === "ORDER_TOTAL") {
      if (unitPriceMinor !== null || change?.unitPriceMinor !== undefined)
        invalid("Order-priced lines require an item total, not a unit price.")
      if (
        quantity !== line.quantity.toString() &&
        change?.enteredTotalMinor === undefined
      )
        invalid(
          "Changing an order-priced quantity requires an explicit replacement item total.",
        )
      totalMinor = money(change?.enteredTotalMinor ?? line.totalMinor)
      if (totalMinor === 0)
        invalid("Order-priced item totals must be positive.")
    } else {
      if (change?.enteredTotalMinor !== undefined)
        invalid("Unit-priced lines require a unit price, not an item total.")
      if (unitPriceMinor === null) invalid("Original unit price is missing.")
      unitPriceMinor = money(change?.unitPriceMinor ?? unitPriceMinor)
      const exact = multiplyExactDecimals(String(unitPriceMinor), quantity)
      if (!/^\d+$/.test(exact))
        invalid(
          "Replacement line total must resolve to an exact minor-unit amount.",
        )
      totalMinor = money(Number(exact))
    }
    if (
      quantity !== line.quantity.toString() ||
      unitPriceMinor !== line.unitPriceMinor ||
      totalMinor !== line.totalMinor
    )
      changed = true
    return {
      orderLineId: line.id,
      offeringId: line.offeringId,
      quantity,
      unitPriceMinor,
      totalMinor,
      originalQuantity: line.quantity.toString(),
      originalUnitPriceMinor: line.unitPriceMinor,
      originalTotalMinor: line.totalMinor,
    }
  })
  const oldSubtotal = money(
    source.lines.reduce((sum, line) => sum + money(line.totalMinor), 0),
  )
  const discountMinor = money(source.discountMinor)
  const taxMinor = money(source.taxMinor)
  const serviceChargeMinor = money(source.serviceChargeMinor)
  if (
    oldSubtotal !== source.subtotalMinor ||
    source.totalMinor !==
      oldSubtotal + serviceChargeMinor - discountMinor + taxMinor
  )
    invalid("Original order totals need reconciliation.")
  if (!changed) invalid("The proposed order terms are unchanged.")
  const subtotalMinor = money(
    lines.reduce((sum, line) => sum + line.totalMinor, 0),
  )
  const totalMinor = money(
    subtotalMinor + serviceChargeMinor - discountMinor + taxMinor,
  )
  return {
    lines,
    subtotalMinor,
    discountMinor,
    taxMinor,
    serviceChargeMinor,
    totalMinor,
    originalTotalMinor: source.totalMinor,
    totalChangeMinor: totalMinor - source.totalMinor,
  }
}
