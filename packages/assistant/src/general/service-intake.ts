import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const quantity = z
  .string()
  .trim()
  .max(40)
  .superRefine((value, ctx) => {
    try {
      parseExactDecimal(value, { allowZero: false, maxScale: 6 })
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a positive exact quantity.",
      })
    }
  })
/** Intention only. Tenant, Store, actor, prices and command identity are server-owned. */
export const serviceIntakeAction = z
  .object({
    action: z.literal("service_intake"),
    customerId: id.optional(),
    customerName: z.string().trim().min(1).max(160).optional(),
    customerPhone: z.string().trim().min(1).max(40).optional(),
    customerEmail: z.string().trim().email().max(320).optional(),
    lines: z
      .array(z.object({ offeringId: id, quantity }).strict())
      .min(1)
      .max(100),
    instructions: z.string().trim().max(4_000).optional(),
    conditionNote: z.string().trim().max(2_000).optional(),
    requestedAssigneeId: id.optional(),
    requestedAt: z.string().datetime({ offset: true }).optional(),
    dueCommitmentAt: z.string().datetime({ offset: true }).optional(),
    priority: z.enum(["normal", "urgent"]).optional(),
    serviceLevel: z.enum(["standard", "express"]).optional(),
    initialPaymentMinor: z
      .number()
      .int()
      .nonnegative()
      .max(100_000_000)
      .optional(),
    initialPaymentMethod: z
      .enum(["bank_transfer", "card", "cash", "other", "pos"])
      .optional(),
    initialPaymentReference: z.string().trim().max(160).optional(),
  })
  .strict()
export type ServiceIntakeAction = z.infer<typeof serviceIntakeAction>
export const serviceIntakeDraftInstructions =
  " For service_intake, readServiceIntakeOptions and saved customer reads resolve real services, variants, prices, work policies and staff names at the current Store. Ask naturally; never ask for internal IDs or JSON. Clarify same-name services/customers/assignees and select exact saved records. D04 supports fixed-price services only; quote-required work uses its quote workflow. Show every exact quantity, tracked Job Lines versus charge-only lines, authorization policy, customer, instructions, assignee, promised time, express surcharge, total, initial recorded payment and balance before app confirmation. Saved customers use customerId with no contact overrides; new contact snapshots use explicit customer facts, without creating a directory record. Payment may be recorded only where canonical service intake supports it; Finance account selection is a separate flow. Automatic customer reminders are unavailable through this simple assistant intake. The model may only read or draft. Never confirm, execute, start work, release gated work, send a notification or mark handoff."

export const serviceIntakeReceiptSchema = z
  .object({
    kind: z.literal("service_intake"),
    recordId: id,
    orderId: id,
    title: z.string(),
    detail: z.string(),
  })
  .strict()
export type ServiceIntakeReceipt = z.infer<typeof serviceIntakeReceiptSchema>
