import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { z } from "zod"

const id = z.string().trim().min(1).max(191)
const money = z.number().int().safe().nonnegative().max(2_147_483_647)
const unitPrice = money.max(100_000_000)
const quantity = z
  .string()
  .trim()
  .transform((value, context) => {
    try {
      const normalized = parseExactDecimal(value, {
        allowZero: false,
        maxScale: 6,
      })
      if (!/^\d{1,32}(?:\.\d{1,6})?$/.test(normalized))
        throw new Error("Quantity exceeds exact stored precision.")
      return normalized
    } catch {
      context.addIssue({
        code: "custom",
        message: "Enter a positive exact quantity.",
      })
      return z.NEVER
    }
  })

/** Selected record references and business facts only. No authority/evidence claims. */
export const quoteIssueLineIntent = z
  .object({
    sourceLineId: id.optional(),
    offeringId: id.optional(),
    availabilityAttestationId: id.optional(),
    outcome: z.enum(["included", "alternative", "declined", "unavailable"]),
    quantity: quantity.optional(),
    unitPriceMinor: unitPrice.optional(),
    customerNote: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((line, context) => {
    if (
      (line.outcome === "included" || line.outcome === "alternative") &&
      (!line.offeringId ||
        line.quantity === undefined ||
        line.unitPriceMinor === undefined)
    )
      context.addIssue({
        code: "custom",
        message:
          "Choose the exact Offering, quantity and unit price for a priced line.",
      })
    if (line.availabilityAttestationId && !line.sourceLineId)
      context.addIssue({
        code: "custom",
        path: ["sourceLineId"],
        message:
          "Keep an availability reference with its exact original source line.",
      })
  })

export const quoteIssueOptionIntent = z
  .object({
    label: z.string().trim().min(1).max(120),
    availabilityOutcome: z.enum(["full", "partial", "unavailable"]),
    fulfilmentType: z.enum(["delivery", "pickup", "unspecified"]).optional(),
    customerNote: z.string().trim().max(500).optional(),
    fulfilmentPromise: z.string().trim().max(500).optional(),
    discountMinor: money.optional(),
    taxMinor: money.optional(),
    fulfilmentFeeMinor: money.optional(),
    lines: z.array(quoteIssueLineIntent).min(1).max(100),
  })
  .strict()
  .superRefine((option, context) => {
    const included = option.lines.filter(
      (line) => line.outcome === "included",
    ).length
    if (
      (option.availabilityOutcome === "full" &&
        included !== option.lines.length) ||
      (option.availabilityOutcome === "partial" &&
        (included === 0 || included === option.lines.length)) ||
      (option.availabilityOutcome === "unavailable" && included !== 0)
    )
      context.addIssue({
        code: "custom",
        path: ["availabilityOutcome"],
        message:
          "Keep this option's availability consistent with its included lines.",
      })
  })

/**
 * Complete editable intent. Native command/option identities are allocated by
 * the proposal owner. This schema alone does not register a GENERAL action.
 */
export const quoteIssueIntent = z
  .object({
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("service_request"), id }).strict(),
      z.object({ kind: z.literal("commerce_inquiry"), id }).strict(),
    ]),
    operation: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("issue") }).strict(),
      z
        .object({ kind: z.literal("revise"), quoteId: id, quoteVersionId: id })
        .strict(),
    ]),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .refine(
        (value) => !/\.\d{4,}(?:Z|[+-]\d{2}:\d{2})$/.test(value),
        "Quotation expiry supports exact milliseconds.",
      )
      .optional(),
    options: z.array(quoteIssueOptionIntent).min(1).max(20),
  })
  .strict()
  .superRefine((input, context) => {
    input.options.forEach((option, optionIndex) => {
      option.lines.forEach((line, lineIndex) => {
        if (input.source.kind === "commerce_inquiry" && !line.sourceLineId)
          context.addIssue({
            code: "custom",
            path: ["options", optionIndex, "lines", lineIndex, "sourceLineId"],
            message: "Choose an exact original Inquiry line.",
          })
        if (
          input.source.kind === "service_request" &&
          line.availabilityAttestationId
        )
          context.addIssue({
            code: "custom",
            path: [
              "options",
              optionIndex,
              "lines",
              lineIndex,
              "availabilityAttestationId",
            ],
            message:
              "Service quotations resolve their source link directly; select an Inquiry for an availability attestation.",
          })
      })
    })
  })
export type QuoteIssueIntent = z.infer<typeof quoteIssueIntent>
