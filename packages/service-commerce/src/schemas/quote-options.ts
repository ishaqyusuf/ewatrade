import { z } from "zod"

const idSchema = z.string().trim().min(1).max(191)
const moneySchema = z.number().int().safe().nonnegative()

export const serviceCommerceQuoteOptionLineProjectionSchema = z
  .object({
    catalogItemName: z.string().trim().min(1).max(240),
    customerNote: z.string().trim().max(500).nullable().optional(),
    offeringName: z.string().trim().min(1).max(240),
    quantity: z
      .string()
      .regex(/^\d+(?:\.\d{1,6})?$/)
      .refine(
        (value) => Number(value) > 0,
        "Quantity must be greater than zero.",
      ),
    totalMinor: moneySchema,
    unitPriceMinor: moneySchema,
    variantName: z.string().trim().max(240),
  })
  .strict()

export const serviceCommerceQuoteOptionProjectionSchema = z
  .object({
    availabilityOutcome: z.enum(["full", "partial", "unavailable"]),
    currencyCode: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),
    customerNote: z.string().trim().max(500).nullable().optional(),
    discountMinor: moneySchema,
    fulfilmentFeeMinor: moneySchema,
    fulfilmentPromise: z.string().trim().max(500).nullable().optional(),
    fulfilmentType: z.enum(["delivery", "pickup", "unspecified"]),
    id: idSchema,
    label: z.string().trim().min(1).max(120),
    lines: z
      .array(serviceCommerceQuoteOptionLineProjectionSchema)
      .min(1)
      .max(100),
    position: z.number().int().min(0).max(99),
    subtotalMinor: moneySchema,
    taxMinor: moneySchema,
    totalMinor: moneySchema,
  })
  .strict()
  .superRefine((option, context) => {
    const lineSubtotal = option.lines.reduce(
      (total, line) => total + line.totalMinor,
      0,
    )
    if (lineSubtotal !== option.subtotalMinor) {
      context.addIssue({
        code: "custom",
        message: "Quote Option subtotal must equal its payable line totals.",
        path: ["subtotalMinor"],
      })
    }
    if (
      option.subtotalMinor -
        option.discountMinor +
        option.taxMinor +
        option.fulfilmentFeeMinor !==
      option.totalMinor
    ) {
      context.addIssue({
        code: "custom",
        message: "Quote Option total does not match its monetary components.",
        path: ["totalMinor"],
      })
    }
  })

export const serviceCommerceQuoteOptionSelectionCommandSchema = z
  .object({
    acceptanceToken: z.string().trim().min(16).max(500),
    clientSelectionId: idSchema,
    optionId: idSchema,
  })
  .strict()

export type ServiceCommerceQuoteOptionProjection = z.infer<
  typeof serviceCommerceQuoteOptionProjectionSchema
>

export function deriveServiceCommerceQuoteOptionState(input: {
  options: ServiceCommerceQuoteOptionProjection[]
  selectedOptionId: string | null
}) {
  if (input.options.length === 0) {
    throw new Error("A Quote Version requires at least one Quote Option.")
  }
  const optionIds = new Set(input.options.map((option) => option.id))
  if (optionIds.size !== input.options.length) {
    throw new Error("A Quote Version cannot repeat a Quote Option identity.")
  }
  if (input.selectedOptionId && !optionIds.has(input.selectedOptionId)) {
    throw new Error(
      "The selected Quote Option does not belong to this version.",
    )
  }
  if (input.selectedOptionId) {
    return {
      payableOptionId: input.selectedOptionId,
      requiresSelection: false,
    }
  }
  return input.options.length === 1
    ? {
        payableOptionId: input.options[0]?.id ?? null,
        requiresSelection: false,
      }
    : { payableOptionId: null, requiresSelection: true }
}
