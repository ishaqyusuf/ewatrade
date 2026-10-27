import { z } from "zod"

/**
 * Customer-side storefront request contracts. Client state is never purchasing
 * authority: the server re-derives scope, publication, plan, prices, units and
 * availability from the verified Host before any write.
 */

/** Templates whose release may accept product order requests. Exact keys only. */
export const ORDERING_TEMPLATE_KEYS: readonly string[] = ["commerce-studio"]

/**
 * Fulfilment methods a published composition offers. Read from the release (never
 * the browser) so the server enforces the merchant's header settings.
 */
export function orderingFulfilmentMethods(composition: unknown) {
  const pages =
    (
      composition as {
        pages?: {
          sections?: { type?: unknown; settings?: Record<string, unknown> }[]
        }[]
      } | null
    )?.pages ?? []
  const header = pages
    .flatMap((page) => page.sections ?? [])
    .find((entry) => entry.type === "commerce-studio-header")
  const methods: ("pickup" | "delivery")[] = []
  if (header?.settings?.["offer-pickup"] !== false) methods.push("pickup")
  if (header?.settings?.["offer-delivery"] === true) methods.push("delivery")
  return methods.length ? methods : (["pickup"] as ("pickup" | "delivery")[])
}

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
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.fulfilment === "delivery" &&
      (value.deliveryAddress ?? "").trim().length < 8
    )
      context.addIssue({
        code: "custom",
        path: ["deliveryAddress"],
        message: "Enter the delivery address.",
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
