import { z } from "zod"
import { capabilityForAction } from "../capabilities/manifest"
import {
  type GeneralAction,
  generalActionSchema,
  generalReceiptSchema,
} from "./contracts"
import { generalMediaOriginSchema } from "./media-provenance"
import { storeSettingsReceiptKind } from "./store-settings-change"

/** Resource ceilings, never permission or an instruction to truncate work. */
export const GENERAL_PLAN_MAX_STEPS = 10
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
const revision = z.number().int().min(1).max(2_147_483_647)
// Preserve the native opaque target ceiling independently from plan/scope IDs.
const targetId = z.string().min(1).max(191)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const actionNames = new Set<string>(
  generalActionSchema.options.map((option) => option.shape.action.value),
)
const actionName = z.custom<GeneralAction["action"]>(
  (value) => typeof value === "string" && actionNames.has(value),
  "Use an existing typed GENERAL action.",
)
const intent = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("action"), payload: generalActionSchema })
    .strict(),
  // Unresolved facts are not guessed, interpolated into IDs or executed.
  z
    .object({
      kind: z.literal("needs_resolution"),
      action: actionName,
      question: z.string().trim().min(1).max(500),
    })
    .strict(),
])
const candidateStep = z
  .object({
    key: id,
    title: z.string().trim().min(1).max(160),
    dependsOn: z.array(id).max(GENERAL_PLAN_MAX_STEPS - 1),
    intent,
  })
  .strict()

function orderedDependencies(
  steps: ReadonlyArray<{ id: string; dependsOn: string[] }>,
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>()
  for (const step of steps) {
    if (
      seen.has(step.id) ||
      new Set(step.dependsOn).size !== step.dependsOn.length ||
      step.dependsOn.some((dependency) => !seen.has(dependency))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Steps must be distinct and dependencies must refer to earlier steps in this exact plan.",
      })
    seen.add(step.id)
  }
}

/** Untrusted/model intent. No server IDs, scope, receipts, approval or execution
 * fields are admitted. The server independently resolves and assigns all bindings.
 */
export const generalPlanIntentSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    steps: z.array(candidateStep).min(1).max(GENERAL_PLAN_MAX_STEPS),
  })
  .strict()
  .superRefine((value, ctx) =>
    orderedDependencies(
      value.steps.map((step) => ({ id: step.key, dependsOn: step.dependsOn })),
      ctx,
    ),
  )

export const generalPlanProposalReferenceSchema = z
  .object({
    proposalId: id,
    revision,
    payloadHash: digest,
    target: z
      .object({ id: targetId, revision: z.string().min(1).max(500) })
      .strict(),
  })
  .strict()
const sourceReview = z.object({ reviewId: id, revision, digest }).strict()
const state = z.discriminatedUnion("status", [
  z.object({ status: z.literal("needs_resolution") }).strict(),
  z.object({ status: z.literal("draft") }).strict(),
  z
    .object({
      status: z.literal("blocked"),
      reason: z.enum([
        "dependency",
        "source_unavailable",
        "source_review",
        "capability_unavailable",
        "unsupported_client",
        "authority_unavailable",
      ]),
    })
    .strict(),
  z
    .object({
      status: z.literal("review_required"),
      proposal: generalPlanProposalReferenceSchema,
      sourceReview: sourceReview.optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("stale"),
      proposal: generalPlanProposalReferenceSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("executing"),
      proposal: generalPlanProposalReferenceSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unknown"),
      proposal: generalPlanProposalReferenceSchema,
      reason: z.enum(["response_lost", "pending_reconciliation"]),
    })
    .strict(),
  z
    .object({
      status: z.literal("completed"),
      proposal: generalPlanProposalReferenceSchema,
      receipt: generalReceiptSchema,
      receiptDigest: digest,
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      proposal: generalPlanProposalReferenceSchema,
      reason: z.enum([
        "canonical_refusal",
        "expired_review",
        "source_unavailable",
      ]),
    })
    .strict(),
  z
    .object({
      status: z.literal("cancelled"),
      proposal: generalPlanProposalReferenceSchema.nullable(),
    })
    .strict(),
])
const serverStep = z
  .object({
    id,
    title: z.string().trim().min(1).max(160),
    dependsOn: z.array(id).max(GENERAL_PLAN_MAX_STEPS - 1),
    intent,
    capability: z.object({ id, version: revision }).strict(),
    state,
  })
  .strict()

/** Server-owned saved snapshot SHAPE only. Parsing does not authenticate its
 * origin, payload/target/receipt digests, current grants, rollout or human action.
 * No plan-level approval token, execute flag, provider callback or offline queue.
 */
export const generalBoundedPlanSchema = z
  .object({
    version: z.literal(1),
    id,
    revision,
    origin: generalMediaOriginSchema,
    title: z.string().trim().min(1).max(160),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.enum(["open", "cancelled"]),
    steps: z.array(serverStep).min(1).max(GENERAL_PLAN_MAX_STEPS),
  })
  .strict()
  .superRefine((value, ctx) => {
    orderedDependencies(value.steps, ctx)
    const proposals = new Set<string>()
    for (const step of value.steps) {
      const action =
        step.intent.kind === "action"
          ? step.intent.payload.action
          : step.intent.action
      const capability = capabilityForAction(action)
      if (
        step.capability.id !== capability.id ||
        step.capability.version !== capability.version
      )
        ctx.addIssue({
          code: "custom",
          message: "Keep the action's actual capability identity and version.",
        })
      if (
        step.intent.kind === "needs_resolution" &&
        !["needs_resolution", "blocked", "cancelled"].includes(
          step.state.status,
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Unresolved facts cannot become a proposal or recorded outcome.",
        })
      if (
        step.intent.kind === "action" &&
        step.state.status === "needs_resolution"
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Keep unresolved intent explicit rather than replacing its typed payload.",
        })
      if ("proposal" in step.state && step.state.proposal) {
        if (proposals.has(step.state.proposal.proposalId))
          ctx.addIssue({
            code: "custom",
            message: "One proposal cannot count as two plan steps.",
          })
        proposals.add(step.state.proposal.proposalId)
      }
      if (step.state.status === "completed") {
        const expected =
          step.intent.kind === "action" &&
          step.intent.payload.action === "store_settings_update"
            ? storeSettingsReceiptKind(step.intent.payload.change.section)
            : capability.receipt
        if (step.state.receipt.kind !== expected)
          ctx.addIssue({
            code: "custom",
            message: "Keep the canonical receipt family for this exact action.",
          })
      }
      if (
        value.status === "cancelled" &&
        !["completed", "cancelled"].includes(step.state.status)
      )
        ctx.addIssue({
          code: "custom",
          message: "Cancellation cannot hide running or uncertain work.",
        })
      if (
        ["executing", "completed"].includes(step.state.status) &&
        step.dependsOn.some(
          (id) =>
            value.steps.find((step) => step.id === id)?.state.status !==
            "completed",
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Running and completed steps require actual completed dependency receipts.",
        })
    }
  })
export type GeneralPlanIntent = z.infer<typeof generalPlanIntentSchema>
export type GeneralBoundedPlan = z.infer<typeof generalBoundedPlanSchema>
export type GeneralPlanProposalReference = z.infer<
  typeof generalPlanProposalReferenceSchema
>
export type GeneralPlanContinuation =
  | { kind: "completed" | "cancelled" }
  | { kind: "recover"; stepId: string; proposal: GeneralPlanProposalReference }
  | { kind: "resolve" | "draft_proposal" | "blocked"; stepId: string }
  | {
      kind: "individual_review" | "refresh_review"
      stepId: string
      proposal: GeneralPlanProposalReference
    }

/** Describe what must be reviewed/recovered next. Never execute, mark success,
 * retry an uncertain effect, mint identities, or infer authority from this result.
 */
export function generalPlanContinuation(
  plan: GeneralBoundedPlan,
): GeneralPlanContinuation {
  if (plan.status === "cancelled") return { kind: "cancelled" }
  // An uncertain attempt must be reconciled by its original saved identity even
  // when another apparently independent step could be started.
  for (const step of plan.steps)
    if (step.state.status === "unknown" || step.state.status === "executing")
      return { kind: "recover", stepId: step.id, proposal: step.state.proposal }
  if (plan.steps.every((step) => step.state.status === "completed"))
    return { kind: "completed" }
  const step = plan.steps.find((step) => step.state.status !== "completed")
  if (!step) return { kind: "completed" }
  if (
    step.dependsOn.some(
      (id) =>
        plan.steps.find((step) => step.id === id)?.state.status !== "completed",
    )
  )
    return { kind: "blocked", stepId: step.id }
  switch (step.state.status) {
    case "needs_resolution":
      return { kind: "resolve", stepId: step.id }
    case "draft":
      return { kind: "draft_proposal", stepId: step.id }
    case "review_required":
      return {
        kind: "individual_review",
        stepId: step.id,
        proposal: step.state.proposal,
      }
    case "stale":
      return {
        kind: "refresh_review",
        stepId: step.id,
        proposal: step.state.proposal,
      }
    default:
      return { kind: "blocked", stepId: step.id }
  }
}
