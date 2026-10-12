import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const target = { jobId: id, lineId: id.optional() }
export const serviceWorkNoteAction = z
  .object({
    action: z.literal("service_work_note"),
    ...target,
    body: z.string().trim().min(1).max(4000),
  })
  .strict()
export const serviceWorkExceptionAction = z
  .object({
    action: z.literal("service_work_exception"),
    ...target,
    type: z.enum([
      "customer_rejection",
      "delay",
      "failed_attempt",
      "other",
      "quality",
    ]),
    description: z.string().trim().min(1).max(2000),
  })
  .strict()
export const serviceWorkRecordAction = z.discriminatedUnion("action", [
  serviceWorkNoteAction,
  serviceWorkExceptionAction,
])
export type ServiceWorkRecordAction = z.infer<typeof serviceWorkRecordAction>
const receipt = {
  recordId: id,
  jobId: id,
  lineId: id.nullable(),
  recordedAt: z.string().datetime({ offset: true }),
  title: z.string(),
  detail: z.string(),
}
/** Original owning note/exception source, not a fabricated ServiceWorkEvent. */
export const serviceWorkRecordReceipt = z.discriminatedUnion("kind", [
  z.object({ ...receipt, kind: z.literal("service_work_note") }).strict(),
  z
    .object({
      ...receipt,
      kind: z.literal("service_work_exception"),
      exceptionType: z.enum([
        "CUSTOMER_REJECTION",
        "DELAY",
        "FAILED_ATTEMPT",
        "OTHER",
        "QUALITY",
      ]),
      outcome: z.literal("OPEN"),
      occurredAt: z.string().datetime({ offset: true }),
    })
    .strict(),
])
export const serviceWorkRecordDraftInstructions =
  " Resolve the exact saved Service Job and optional exact Job Line. Clarify same-name work and never ask for internal IDs or JSON. A private work note records the customer's or staff member's stated text; an exception records the stated delay, quality issue, failed attempt, customer rejection or other issue as OPEN. Do not invent facts, alter existing notes, resolve exceptions, cancel work, reopen completed work, create rework, notify customers or record handoff/payment. Review the exact target, current lifecycle and complete text/category, then wait for separate app confirmation. Notes remain internal and no provider message is sent."
