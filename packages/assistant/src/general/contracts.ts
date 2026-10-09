import { z } from "zod"
const id = z.string().trim().min(1).max(128)
const name = z.string().trim().min(1).max(160)
const money = z.number().int().min(0).max(100_000_000)
const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((v) => Number(v) > 0, "Quantity must be positive")
export const generalActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("customer_create"),
      name,
      phone: z.string().trim().max(40).optional(),
      email: z.string().email().max(254).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("product_create"),
      name,
      canonicalUnitName: z.string().trim().min(1).max(80),
      priceMinor: money,
    })
    .strict(),
  z
    .object({
      action: z.literal("order_create"),
      customerId: id.optional(),
      notes: z.string().trim().max(2000).optional(),
      lines: z
        .array(
          z
            .object({
              offeringId: id,
              quantity,
              expectedConfigurationVersionId: id.optional(),
              expectedFixedPriceMinor: money,
            })
            .strict(),
        )
        .min(1)
        .max(30),
    })
    .strict(),
  z
    .object({
      action: z.literal("payment_record"),
      orderId: id,
      amountMinor: money.refine((v) => v > 0),
      method: z.enum(["bank_transfer", "card", "cash", "other", "pos"]),
      note: z.string().trim().max(500).optional(),
    })
    .strict(),
  // Omitted fields stay unchanged; null clears phone or email.
  z
    .object({
      action: z.literal("customer_update"),
      customerId: id,
      name: name.optional(),
      phone: z.string().trim().min(3).max(40).nullable().optional(),
      email: z.string().email().max(254).nullable().optional(),
    })
    .strict()
    .refine(
      (input) =>
        input.name !== undefined ||
        input.phone !== undefined ||
        input.email !== undefined,
      "Change at least one detail.",
    ),
])
export const generalOrderActionSchema = generalActionSchema.options[2]
export type GeneralAction = z.infer<typeof generalActionSchema>
export type GeneralActionName = GeneralAction["action"]
export const generalReceiptSchema = z
  .object({
    kind: z.enum(["customer", "product", "order", "payment"]),
    recordId: id,
    orderId: id.optional(),
    title: z.string(),
    detail: z.string(),
  })
  .strict()
export type GeneralReceipt = z.infer<typeof generalReceiptSchema>
export const generalProposalSchema = z
  .object({
    id,
    revision: z.number().int().positive(),
    payload: generalActionSchema,
    status: z.enum([
      "PENDING",
      "EXECUTING",
      "COMPLETED",
      "CANCELLED",
      "EXPIRED",
      "FAILED",
    ]),
    expiresAt: z.string().datetime(),
    receipt: generalReceiptSchema.nullable(),
    review: z.array(z.string()).optional(),
    approvalToken: z.string().optional(),
  })
  .strict()
export type GeneralProposal = z.infer<typeof generalProposalSchema>
export const generalAnswerSchema = z
  .object({
    id,
    title: z.string().max(160),
    value: z.string().max(160),
    scope: z.string().max(500),
    asOf: z.string().datetime(),
    detail: z.string().max(1000),
  })
  .strict()
export type GeneralAnswer = z.infer<typeof generalAnswerSchema>
export const generalStoredPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(16000) }).strict(),
  z
    .object({
      type: z.literal("data-general-answer"),
      data: generalAnswerSchema,
    })
    .strict(),
])
export type GeneralDataParts = {
  "general-answer": GeneralAnswer
  "general-run": { runId: string; remainingRequests: number }
  "general-proposal": { proposalId: string }
}
export function generalActionSummary(
  action: GeneralAction,
  currencyCode: string,
) {
  const amount = (minor: number) =>
    `${currencyCode} ${(minor / 100).toFixed(2)}`
  switch (action.action) {
    case "customer_create":
      return [action.name, action.phone, action.email]
        .filter(Boolean)
        .join(" · ")
    case "product_create":
      return `${action.name} · ${action.canonicalUnitName} · ${amount(action.priceMinor)} per unit`
    case "order_create":
      return `${action.lines.map((line) => `${line.quantity} × offering ${line.offeringId}`).join("\n")}\n${action.customerId ? `Customer ${action.customerId}` : "Walk-in customer"}${action.notes ? `\n${action.notes}` : ""}`
    case "customer_update":
      return [
        `Customer ${action.customerId}`,
        action.name !== undefined ? `Name: ${action.name}` : null,
        action.phone !== undefined
          ? `Phone: ${action.phone ?? "removed"}`
          : null,
        action.email !== undefined
          ? `Email: ${action.email ?? "removed"}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    case "payment_record":
      return `${amount(action.amountMinor)} · ${action.method.replaceAll("_", " ")} · order ${action.orderId}${action.note ? `\n${action.note}` : ""}`
  }
}
