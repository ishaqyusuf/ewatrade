import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const reason = z.string().trim().min(1).max(500)
const job = { jobId: id }

/** Intent only: scope, revisions, event identity and timestamps are server-owned. */
export const serviceJobAssignAction = z
  .object({
    action: z.literal("service_job_assign"),
    ...job,
    assigneeUserId: id,
    reason: reason.optional(),
  })
  .strict()
export const serviceJobRescheduleAction = z
  .object({
    action: z.literal("service_job_reschedule"),
    ...job,
    promisedAt: z.string().datetime({ offset: true }),
    reason,
  })
  .strict()
export const serviceJobLineTransitionAction = z
  .object({
    action: z.literal("service_job_line_transition"),
    ...job,
    lineId: id,
    toStatus: z.enum([
      "blocked",
      "cancelled",
      "in_progress",
      "queued",
      "ready_for_handoff",
    ]),
    reason: reason.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (["blocked", "cancelled"].includes(value.toStatus) && !value.reason)
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Explain why this work is blocked or cancelled.",
      })
  })
export const serviceWorkLifecycleAction = z.discriminatedUnion("action", [
  serviceJobAssignAction,
  serviceJobRescheduleAction,
  serviceJobLineTransitionAction,
])
export type ServiceWorkLifecycleAction = z.infer<
  typeof serviceWorkLifecycleAction
>
export const serviceWorkLifecycleReceipt = z
  .object({
    kind: z.literal("service_work"),
    recordId: id,
    eventId: id,
    eventType: z.enum([
      "ASSIGNED",
      "REASSIGNED",
      "DUE_COMMITMENT_CREATED",
      "DUE_COMMITMENT_REVISED",
      "STATUS_CHANGED",
    ]),
    recordedAt: z.string().datetime({ offset: true }),
    effectiveAt: z.string().datetime({ offset: true }),
    title: z.string(),
    detail: z.string(),
  })
  .strict()
export const serviceWorkLifecycleDraftInstructions =
  " Resolve the exact saved Service Job and, for work progress, its exact Job Line. Clarify ambiguous jobs, lines or assignees; never ask for internal IDs or JSON. Review the selected saved offering and quantity, current state, authorization, assignment or promised time, required reason and any customer-reminder effect before app confirmation. Start and ready are work milestones; ready never means handed off or paid. Completion, handoff, rework, payments and provider messaging are separate flows. Do not execute or confirm from model text."
