import {
  addExactDecimals,
  compareExactDecimals,
  isExactDecimal,
  multiplyExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { z } from "zod"
import { readRecordOriginSchema } from "./read-record-target"
import { serviceNameKey } from "./service-job-draft"

/** Explicit new orders must reach catalog-aware preparation when that tool is available. */
export function isCatalogOrderPreparationIntent(text: string) {
  return /^(?:please\s+|abeg\s+)?(?:new|create|prepare|record)(?:\s+(?:a|an))?\s+order\b/i.test(
    text.trim(),
  )
}
const quantity = z
  .string()
  .max(40)
  .refine(
    (value): boolean =>
      isExactDecimal(value, { allowZero: false, maxScale: 6 }),
    "Enter a positive quantity",
  )
const amount = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/)
export const orderPreparationRequestSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            quantity,
            deliveredQuantity: z
              .string()
              .max(40)
              .refine(
                (value) =>
                  isExactDecimal(value, { allowZero: true, maxScale: 6 }),
                "Enter a nonnegative delivered quantity",
              )
              .optional()
              .describe(
                "Only when the owner supplied an actual delivered amount for this line; never infer full delivery.",
              ),
            unitName: z.string().trim().min(1).max(80).optional(),
            choices: z
              .array(
                z
                  .object({
                    optionName: z.string().min(1).max(80),
                    value: z.string().min(1).max(80),
                  })
                  .strict(),
              )
              .max(3)
              .default([]),
            unitPrice: amount.optional(),
            disposition: z.enum(["catalog", "order_only"]).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    extraCharges: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            amount: amount.optional(),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    customerName: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .describe("A name the owner actually supplied; omit for Walk-in."),
    payment: z
      .object({
        paid: z
          .literal(true)
          .describe(
            "The owner said money was received. Retain this even when amount, method or account is unknown; those remain editable in the form.",
          ),
        amount: amount.optional(),
        method: z
          .enum(["cash", "bank_transfer", "pos", "card", "other"])
          .optional(),
        moneyAccountId: z.string().min(1).max(128).optional(),
      })
      .strict()
      .optional(),
    delivered: z.boolean().optional(),
    partialDelivery: z.boolean().optional(),
    stockAlreadyRecorded: z.boolean().optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict()
export type OrderPreparationRequest = z.infer<
  typeof orderPreparationRequestSchema
>
export const orderPreparationLineSchema = z
  .object({
    name: z.string().max(300),
    quantity,
    unitName: z.string().max(80).optional(),
    status: z.enum([
      "resolved",
      "missing_item",
      "missing_choice",
      "ambiguous",
      "archived",
      "unavailable",
      "insufficient_stock",
      "incomplete_search",
      "price_needed",
      "order_only",
    ]),
    issue: z.string().max(500).optional(),
    catalogItemId: z.string().optional(),
    variantId: z.string().optional(),
    offeringId: z.string().optional(),
    unitPriceMinor: z.number().int().nonnegative().safe().optional(),
    totalMinor: z.number().int().nonnegative().safe().optional(),
    configurationVersionId: z.string().optional(),
    pricingPolicy: z.enum(["fixed", "order_total"]).optional(),
  })
  .strict()
export const orderPreparationDraftSchema = z
  .object({
    origin: readRecordOriginSchema,
    customer: z
      .object({ id: z.string().optional(), name: z.string().max(160) })
      .strict()
      .optional(),
    currencyCode: z.string().length(3),
    request: orderPreparationRequestSchema,
    paymentAccountSuggested: z.boolean().optional(),
    lines: z.array(orderPreparationLineSchema).max(20),
    totalMinor: z.number().int().nonnegative().safe().nullable(),
    issues: z.array(z.string().max(500)).max(30),
  })
  .strict()
export type OrderPreparationDraft = z.infer<typeof orderPreparationDraftSchema>
export type OrderCandidate = {
  catalogItemId: string
  itemName: string
  variantId: string
  offeringId: string
  unitName: string
  canonical: boolean
  transactionScale?: number
  choices: Array<{ optionName: string; value: string }>
  active: boolean
  available: boolean
  fixedPriceMinor: number | null
  pricingPolicy?: "fixed" | "order_total" | "quote_required"
  configurationVersionId?: string
  stock?: { key: string; available: string; factor: string }
}
const key = (value: string) =>
  serviceNameKey(value.replace(/\bt[ -]?shirts?\b/gi, "t shirt"))
const minor = (value: string) => Number(multiplyExactDecimals(value, "100"))

/** Pure preparation: callers supply scoped complete search evidence and real saved offerings. */
export function resolveOrderPreparation(
  request: OrderPreparationRequest,
  searches: Array<{
    name: string
    complete: boolean
    candidates: OrderCandidate[]
    catalogItems?: Array<{ id: string; name: string }>
  }>,
) {
  const allocations = new Map<
    string,
    { quantity: string; available: string; indices: number[] }
  >()
  const lines: OrderPreparationDraft["lines"] = request.lines.map(
    (line, index) => {
      const search = searches.find(
        (entry) => key(entry.name) === key(line.name),
      )
      const base = {
        name: [line.name, ...line.choices.map((choice) => choice.value)].join(
          " · ",
        ),
        quantity: line.quantity,
        unitName: line.unitName,
      }
      if (!search?.complete)
        return {
          ...base,
          status: "incomplete_search",
          issue:
            "Catalog search is incomplete. Narrow the product name before treating it as missing.",
        }
      const items = search.candidates.filter(
        (entry) => key(entry.itemName) === key(line.name),
      )
      if (!items.length) {
        const known = search.catalogItems?.find(
          (item) => key(item.name) === key(line.name),
        )
        if (known)
          return {
            ...base,
            catalogItemId: known.id,
            status: "unavailable",
            issue:
              "This product is saved but has no matching configured offering. Review its catalog settings.",
          }
        if (line.disposition === "order_only") {
          const totalMinor =
            line.unitPrice === undefined
              ? undefined
              : Number(
                  multiplyExactDecimals(
                    line.quantity,
                    String(minor(line.unitPrice)),
                  ),
                )
          return {
            ...base,
            status: "order_only",
            unitPriceMinor:
              line.unitPrice === undefined ? undefined : minor(line.unitPrice),
            totalMinor: Number.isSafeInteger(totalMinor)
              ? totalMinor
              : undefined,
            issue:
              totalMinor === undefined
                ? "Enter the price in the order form."
                : undefined,
          }
        }
        return {
          ...base,
          status: "missing_item",
          issue:
            "Not in the catalog. Choose an order-only item or add it to the catalog.",
        }
      }
      const choices = items.filter(
        (entry) =>
          line.choices.every((choice) =>
            entry.choices.some(
              (saved) =>
                key(saved.optionName) === key(choice.optionName) &&
                key(saved.value) === key(choice.value),
            ),
          ) &&
          (line.unitName
            ? key(entry.unitName) === key(line.unitName)
            : entry.canonical),
      )
      if (
        !choices.length &&
        new Set(items.map((item) => item.catalogItemId)).size > 1
      )
        return {
          ...base,
          status: "ambiguous",
          issue:
            "More than one saved product has this name. Select the exact product before adding a choice.",
        }
      if (!choices.length && items.every((item) => !item.active))
        return {
          ...base,
          status: "archived",
          issue:
            "This saved product is archived; it cannot be treated as a missing item.",
        }
      if (!choices.length && items.every((item) => !item.available))
        return {
          ...base,
          status: "unavailable",
          issue:
            "This product is unavailable in the current Store; it cannot become an order-only substitute.",
        }
      if (!choices.length && line.disposition === "order_only") {
        const unitPriceMinor =
          line.unitPrice === undefined ? undefined : minor(line.unitPrice)
        const total =
          unitPriceMinor === undefined
            ? undefined
            : Number(
                multiplyExactDecimals(line.quantity, String(unitPriceMinor)),
              )
        return {
          ...base,
          status: "order_only",
          unitPriceMinor,
          totalMinor: Number.isSafeInteger(total) ? total : undefined,
        }
      }
      if (!choices.length)
        return {
          ...base,
          status: "missing_choice",
          catalogItemId: items[0]?.catalogItemId,
          issue:
            "This product is saved, but the requested choice or selling unit is missing. Complete it under that product.",
        }
      if (choices.length !== 1)
        return {
          ...base,
          status: "ambiguous",
          issue:
            "More than one saved choice matches. Select the exact option and unit.",
        }
      const match = choices[0]
      if (!match) throw Error("Missing exact candidate")
      const selected = {
        ...base,
        catalogItemId: match.catalogItemId,
        variantId: match.variantId,
        offeringId: match.offeringId,
        unitName: match.unitName,
        configurationVersionId: match.configurationVersionId,
      }
      if (!match.active)
        return {
          ...selected,
          status: "archived",
          issue:
            "The saved item or choice is archived. It cannot be treated as a missing item.",
        }
      if (!match.available)
        return {
          ...selected,
          status: "unavailable",
          issue: "This saved offering is unavailable in the current Store.",
        }
      if (
        match.transactionScale !== undefined &&
        !isExactDecimal(line.quantity, {
          allowZero: false,
          maxScale: match.transactionScale,
        })
      )
        return {
          ...selected,
          status: "price_needed",
          issue: `Enter a quantity with at most ${match.transactionScale} decimal places for this selling unit.`,
        }
      if (
        match.fixedPriceMinor === null &&
        (match.pricingPolicy !== "order_total" || line.unitPrice === undefined)
      )
        return {
          ...selected,
          status: "price_needed",
          issue: "Review this offering’s order-specific price in the form.",
        }
      if (
        line.unitPrice !== undefined &&
        match.fixedPriceMinor !== null &&
        minor(line.unitPrice) !== match.fixedPriceMinor
      )
        return {
          ...selected,
          status: "price_needed",
          issue:
            "The stated price differs from the saved fixed price. Review an authorized price change before saving.",
        }
      const unitPriceMinor =
        match.fixedPriceMinor ??
        (line.unitPrice === undefined ? undefined : minor(line.unitPrice))
      if (unitPriceMinor === undefined) throw Error("Resolved price missing")
      const totalMinor = Number(
        multiplyExactDecimals(line.quantity, String(unitPriceMinor)),
      )
      if (
        !Number.isSafeInteger(totalMinor) ||
        (match.pricingPolicy === "order_total" && totalMinor <= 0)
      )
        return {
          ...selected,
          status: "price_needed",
          issue: "This quantity does not give an exact currency amount.",
        }
      if (match.stock) {
        const wanted = multiplyExactDecimals(
          line.quantity,
          match.stock.factor,
          6,
        )
        const prior = allocations.get(match.stock.key)
        allocations.set(match.stock.key, {
          quantity: addExactDecimals(prior?.quantity ?? "0", wanted, 6),
          available: match.stock.available,
          indices: [...(prior?.indices ?? []), index],
        })
      }
      return {
        ...selected,
        status: "resolved",
        unitPriceMinor,
        pricingPolicy:
          match.pricingPolicy === "order_total" ? "order_total" : "fixed",
        totalMinor,
      }
    },
  )
  for (const allocation of allocations.values())
    if (compareExactDecimals(allocation.quantity, allocation.available) > 0)
      for (const index of allocation.indices) {
        const line = lines[index]
        if (line) {
          line.status = "insufficient_stock"
          line.issue =
            "The combined requested quantity exceeds available stock. Review stock before saving."
        }
      }
  const issues = lines.flatMap((line) =>
    line.status === "resolved" || line.status === "order_only"
      ? []
      : [`${line.name}: ${line.issue}`],
  )
  if (request.stockAlreadyRecorded && request.delivered)
    issues.push(
      "Stock effects are already recorded. Link or correct the original order before recording delivery again.",
    )
  if (request.occurredAt)
    issues.push(
      "A historical date was supplied. Review the existing dated workflow before recording payment or stock effects.",
    )
  if (
    request.partialDelivery ||
    request.lines.some((line) => line.deliveredQuantity !== undefined)
  )
    issues.push(
      "Partial delivery quantities are retained. Record them through the existing order fulfillment workflow; this combined review does not apply a full delivery.",
    )
  for (const charge of request.extraCharges ?? [])
    if (charge.amount === undefined)
      issues.push(`Enter the ${charge.name} charge in the draft.`)
  let totalMinor: number | null = null
  if (lines.every((line) => line.totalMinor !== undefined) && !issues.length) {
    const total =
      lines.reduce((sum, line) => sum + (line.totalMinor ?? 0), 0) +
      (request.extraCharges ?? []).reduce(
        (sum, charge) =>
          sum + (charge.amount === undefined ? 0 : minor(charge.amount)),
        0,
      )
    if (Number.isSafeInteger(total)) totalMinor = total
  }
  return { lines, issues, totalMinor }
}

export function orderPreparationIssues(action: {
  lines: readonly unknown[]
  preparation?: OrderPreparationRequest
  prepared?: OrderPreparationDraft
  initialPayment?: unknown
}) {
  const issues = [...(action.prepared?.issues ?? [])]
  if (!action.lines.length)
    issues.push("Add or resolve at least one order item.")
  if (action.preparation && !action.prepared)
    issues.push("Refresh the prepared order before saving.")
  if (action.prepared?.totalMinor === null)
    issues.push("Complete the unresolved items and prices before saving.")
  if (action.preparation?.payment && !action.initialPayment)
    issues.push(
      "Choose the received payment method and amount in this draft. No method is assumed.",
    )
  return [...new Set(issues)]
}
