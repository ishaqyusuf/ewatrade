import { z } from "zod"

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const quantity = z
  .string()
  .regex(/^(?:0|[1-9]\d?)(?:\.\d{1,6})?$/)
  .refine(
    (value) => Number(value) > 0 && Number(value) <= 50,
    "Enter a quantity greater than zero and no more than 50.",
  )
const lines = z
  .array(z.object({ offeringId: id, quantity }).strict())
  .min(1)
  .max(20)
  .refine(
    (value) =>
      new Set(value.map((line) => line.offeringId)).size === value.length,
    "Select each option only once.",
  )

/** Customer input only. Publication, tenant, Store and prices are server-derived. */
export const storefrontServiceRequestSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    formId: id,
    itemId: id,
    offeringId: id,
    quantity,
    lines: lines.optional(),
    customerName: z.string().trim().min(1, "Enter your name.").max(80),
    customerPhone: z
      .string()
      .trim()
      .min(7, "Enter a phone number the business can reach.")
      .max(32)
      .regex(/^\+?[\d\s()-]+$/, "Enter a phone number the business can reach.")
      .refine((value) => {
        const digits = value.replace(/\D/g, "")
        return digits.length >= 7 && digits.length <= 15
      }, "Enter a phone number the business can reach."),
    details: z.string().trim().max(500).default(""),
  })
  .strict()
  .refine(
    (value) =>
      !value.lines ||
      (value.lines[0]?.offeringId === value.offeringId &&
        value.lines[0]?.quantity === value.quantity),
    {
      message: "The first line must match the selected option and quantity.",
      path: ["lines"],
    },
  )

export type StorefrontServiceRequestInput = z.infer<
  typeof storefrontServiceRequestSchema
>
