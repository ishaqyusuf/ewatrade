import { z } from "zod"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"

const id = z.string().trim().min(1).max(128)
const quantity = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    try {
      parseExactDecimal(value, { allowZero: false, maxScale: 6 })
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "Enter a positive exact quantity with at most six decimal places.",
      })
    }
  })
export const serviceWorkReworkAction = z
  .object({
    action: z.literal("service_work_rework"),
    jobId: id,
    lineId: id,
    quantity,
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
/** Settle balance through its existing receiving-account flow before handoff. */
export const serviceWorkHandoffAction = z
  .object({
    action: z.literal("service_work_handoff"),
    jobId: id,
    note: z.string().trim().max(500).optional(),
  })
  .strict()
export const serviceWorkCompletionAction = z.discriminatedUnion("action", [
  serviceWorkReworkAction,
  serviceWorkHandoffAction,
])
export type ServiceWorkCompletionAction = z.infer<
  typeof serviceWorkCompletionAction
>
export const serviceWorkCompletionReceipt = z
  .object({
    kind: z.literal("service_work"),
    recordId: id,
    eventId: id,
    eventType: z.enum(["REWORK", "REMOTE_HANDOFF"]),
    recordedAt: z.string().datetime({ offset: true }),
    effectiveAt: z.string().datetime({ offset: true }),
    sourceJobId: id,
    sourceLineId: id.nullable(),
    title: z.string(),
    detail: z.string(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.eventType === "REWORK" &&
      (!value.sourceLineId || value.recordId === value.sourceJobId)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Linked rework requires its original completed Line and a distinct new Job.",
      })
    if (
      value.eventType === "REMOTE_HANDOFF" &&
      (value.sourceLineId !== null || value.recordId !== value.sourceJobId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Handoff belongs to the exact original Job.",
      })
  })
export type ServiceWorkCompletionReceipt = z.infer<
  typeof serviceWorkCompletionReceipt
>
export const serviceWorkCompletionDraftInstructions =
  " Resolve the exact saved Service Job and completed source Line for linked rework. Review exact source quantity, new quantity and reason; this creates new queued authorized linked work and preserves the completed original. Handoff requires all active Lines already authorized and ready/completed and the full balance already settled. Never combine payment, infer receiving accounts, mark merely ready as collected, or confirm through model text. Review original work history and any due-reminder cancellation, then wait for separate app confirmation. Outstanding customer updates, clinical-linked work, provider delivery and missing orchestration require their separate native workflows."
