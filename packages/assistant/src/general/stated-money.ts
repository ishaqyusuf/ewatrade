import { z } from "zod"
import { generalActionSchema, orderCustomLine } from "./contracts"

/**
 * Money the merchant states ("they paid 3,000") reaches draftAction in major
 * units and the server converts it. Models asked for minor units copied the
 * spoken figure (12 Oct 2026: "paid 3,000 cash" became amountMinor 3000, i.e.
 * ₦30.00). Prices copied from saved reads (expectedFixedPriceMinor) stay minor.
 */
export const statedAmount = z
  .string()
  .trim()
  .regex(
    /^(?:\d{1,3}(?:,\d{3})+|\d{1,12})(?:\.\d{1,2})?$/,
    'Write the amount in major currency units as the user said it, e.g. "3000" or "3,000.50".',
  )
  .describe(
    'Money the user stated, in major currency units exactly as said: ₦3,000 is "3000", ₦2,500.50 is "2500.50". Never convert to kobo/cents; the server does.',
  )

/** "3,000.5" → 300050. Exact string arithmetic; no floating point. */
export function statedAmountToMinor(value: string) {
  const [whole = "0", fraction = ""] = value
    .trim()
    .replaceAll(",", "")
    .split(".")
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
}

function option<
  A extends
    (typeof generalActionSchema.options)[number]["shape"]["action"]["value"],
>(action: A) {
  const schema = generalActionSchema.options.find(
    (entry) => entry.shape.action.value === action,
  )
  if (!schema) throw Error(`No proposal schema for ${action}`)
  return schema as Extract<
    (typeof generalActionSchema.options)[number],
    { shape: { action: z.ZodLiteral<A> } }
  >
}

const orderCreate = option("order_create")
const paymentRecord = option("payment_record")
const catalogLine = orderCreate.shape.lines.element.options[0]
const statedOrderCreate = orderCreate.extend({
  initialPayment: orderCreate.shape.initialPayment
    .unwrap()
    .omit({ amountMinor: true })
    .extend({ amount: statedAmount })
    .strict()
    .optional(),
  lines: z
    .array(
      z.union([
        // The contract line carries a refinement, which `.omit` refuses.
        z
          .object(catalogLine.shape)
          .omit({ enteredTotalMinor: true })
          .extend({
            enteredTotal: statedAmount
              .describe(
                'Explicit item total the user stated for an order-priced offering, in major units ("1500" for ₦1,500).',
              )
              .optional(),
          })
          .strict()
          .refine(
            (line) =>
              (line.expectedFixedPriceMinor !== undefined) !==
              (line.enteredTotal !== undefined),
            "Choose a fixed price snapshot or an explicit item total.",
          ),
        orderCustomLine
          .omit({ amountMinor: true })
          .extend({ amount: statedAmount })
          .strict(),
      ]),
    )
    .min(1)
    .max(30),
})
const statedPaymentRecord = paymentRecord
  .omit({ amountMinor: true })
  .extend({ amount: statedAmount })
  .strict()

/** draftAction schemas that take stated money instead of the stored minor fields. */
export const statedMoneyDraftSchemas = {
  order_create: statedOrderCreate,
  payment_record: statedPaymentRecord,
} as const

/** Turns a stated-money draft back into the canonical proposal payload. */
export function canonicalStatedMoneyDraft(input: unknown): unknown {
  if (!input || typeof input !== "object" || !("action" in input)) return input
  if (input.action === "payment_record") {
    const { amount, ...rest } = statedPaymentRecord.parse(input)
    return { ...rest, amountMinor: statedAmountToMinor(amount) }
  }
  if (input.action !== "order_create") return input
  const { initialPayment, lines, ...rest } = statedOrderCreate.parse(input)
  return {
    ...rest,
    ...(initialPayment
      ? {
          initialPayment: (({ amount, ...payment }) => ({
            ...payment,
            amountMinor: statedAmountToMinor(amount),
          }))(initialPayment),
        }
      : {}),
    lines: lines.map((line) => {
      if ("custom" in line) {
        const { amount, ...custom } = line
        return { ...custom, amountMinor: statedAmountToMinor(amount) }
      }
      const { enteredTotal, ...catalog } = line
      return enteredTotal === undefined
        ? catalog
        : { ...catalog, enteredTotalMinor: statedAmountToMinor(enteredTotal) }
    }),
  }
}
