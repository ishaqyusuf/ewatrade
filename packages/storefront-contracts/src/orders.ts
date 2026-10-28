import { z } from "zod"
import { readStorefrontFeatureConfig } from "./features"

/**
 * Customer-side storefront request contracts. Client state is never purchasing
 * authority: the server re-derives scope, publication, plan, prices, units and
 * availability from the verified Host before any write.
 */

/**
 * Fulfilment methods a published composition offers. Read from the release (never
 * the browser) so the server enforces the merchant's header settings.
 */
export function orderingFulfilmentMethods(composition: unknown) {
  if (
    composition &&
    typeof composition === "object" &&
    !("schemaVersion" in composition)
  ) {
    // Compatibility for older pure presentation callers. Domain writers validate
    // the complete published composition before using this projection.
    const value = composition as {
      pages?: {
        sections?: { type?: string; settings?: Record<string, unknown> }[]
      }[]
    }
    const header = value.pages
      ?.flatMap((page) => page.sections ?? [])
      .find((section) => section.type === "commerce-studio-header")
    const methods: ("pickup" | "delivery")[] = []
    if (header?.settings?.["offer-pickup"] !== false) methods.push("pickup")
    if (header?.settings?.["offer-delivery"] === true) methods.push("delivery")
    return methods
  }
  return readStorefrontFeatureConfig(composition)?.orders.fulfilment ?? []
}

export {
  LOW_STOCK_COUNT_SETTING,
  publicLowStockCountsEnabled,
} from "./features"

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
/** Positive decimal up to 6 places; unit scale is checked against the offering. */
export const storefrontQuantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}(?:\.\d{1,6})?$/, "Enter a valid quantity.")
  .refine((value) => Number(value) > 0, "Quantity must be more than zero.")
  .refine((value) => Number(value) <= 9999, "That quantity is too large.")

const plain = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !/<\s*\/?\s*[a-z!]|javascript:/i.test(value),
      "Use plain text only.",
    )

export const STOREFRONT_ORDER_MAX_LINES = 20

export const storefrontOrderLineSchema = z
  .object({
    itemId: id,
    offeringId: id,
    quantity: storefrontQuantitySchema,
    /** The price the customer saw. Evidence only; a mismatch refuses the line. */
    observedUnitPriceMinor: z.number().int().nonnegative(),
    preorder: z.boolean().optional(),
  })
  .strict()

export const storefrontOrderRequestSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    lines: z
      .array(storefrontOrderLineSchema)
      .min(1, "Your bag is empty.")
      .max(STOREFRONT_ORDER_MAX_LINES, "Your bag has too many lines."),
    customerName: plain(80).pipe(z.string().min(2, "Enter your name.")),
    customerPhone: z
      .string()
      .trim()
      .min(7, "Enter your WhatsApp number.")
      .max(24, "Enter a valid WhatsApp number."),
    customerEmail: z
      .union([z.literal(""), z.string().trim().email("Enter a valid email.")])
      .optional(),
    fulfilment: z.enum(["pickup", "delivery"]),
    deliveryAddress: plain(300).optional(),
    notes: plain(500).optional(),
    preferredDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid preferred date.")
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.lines.some((line) => line.preorder) && !value.preferredDate)
      context.addIssue({
        code: "custom",
        path: ["preferredDate"],
        message: "Choose a preferred date for your preorder.",
      })
    if (value.preferredDate && !value.lines.some((line) => line.preorder))
      context.addIssue({
        code: "custom",
        path: ["preferredDate"],
        message: "Choose request ahead for the items you need later.",
      })
    const seen = new Set<string>()
    for (const [index, line] of value.lines.entries()) {
      if (seen.has(line.offeringId))
        context.addIssue({
          code: "custom",
          path: ["lines", index, "offeringId"],
          message: "Each option can appear once in your bag.",
        })
      seen.add(line.offeringId)
    }
  })
export type StorefrontOrderRequestInput = z.infer<
  typeof storefrontOrderRequestSchema
>

/** Line-level reasons a submission was refused without saving anything. */
export type StorefrontOrderLineIssue = {
  offeringId: string
  reason:
    | "unavailable"
    | "price_changed"
    | "price_on_request"
    | "out_of_stock"
    | "insufficient_stock"
    | "invalid_quantity"
  /** Current public price when it changed; never a stock quantity. */
  currentUnitPriceMinor?: number
}

export const storefrontRequestReplySchema = z
  .object({
    clientMessageId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    body: plain(800).pipe(z.string().min(1, "Write a reply.")),
  })
  .strict()

export const storefrontWithdrawSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict()

/**
 * Customer-facing request reference (`R-` order, `S-` service request), as printed on
 * receipts. Tolerates case, spaces and a missing dash. A reference is only a locator:
 * it never grants access without a verified identity for the same request.
 */
export const storefrontRequestReferenceSchema = z
  .string()
  .max(24)
  .transform((value) => value.toUpperCase().replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^[RS][23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/,
        "Enter the reference from your receipt, like R-7KQ2MX.",
      ),
  )
  .transform((value) => `${value.slice(0, 1)}-${value.slice(1)}`)

export const storefrontCustomerIdentifierSchema = z.discriminatedUnion(
  "channel",
  [
    z
      .object({
        channel: z.literal("email"),
        identifier: z
          .string()
          .trim()
          .toLowerCase()
          .email("Enter a valid email."),
      })
      .strict(),
    z
      .object({
        channel: z.literal("whatsapp"),
        identifier: z
          .string()
          .trim()
          .min(7, "Enter your WhatsApp number.")
          .max(24),
      })
      .strict(),
  ],
)

export const storefrontOtpVerifySchema = z
  .object({
    challengeId: id,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code."),
  })
  .strict()

/** Customer-facing request status vocabulary shared by receipts and history. */
export type StorefrontRequestStage =
  | "received"
  | "needs_information"
  | "quoted"
  | "confirmed"
  | "declined"
  | "withdrawn"
  | "ready"
  | "completed"
  | "cancelled"
