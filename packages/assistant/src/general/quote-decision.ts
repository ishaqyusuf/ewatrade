import { z } from "zod"
import {
  generalQuoteApprovalReadInput,
  quoteApprovalTargetSchema,
} from "./quote-reads"

const reason = z.string().trim().min(1).max(500)
/** Intent only; native policy revision, actor and decision key are server-owned. */
export const quoteApproveAction = generalQuoteApprovalReadInput
  .extend({
    action: z.literal("commerce_quote_approve"),
    reason,
  })
  .strict()
export const quoteRejectAction = generalQuoteApprovalReadInput
  .extend({
    action: z.literal("commerce_quote_reject"),
    reason,
  })
  .strict()
export const quoteDecisionAction = z.discriminatedUnion("action", [
  quoteApproveAction,
  quoteRejectAction,
])
export type QuoteDecisionAction = z.infer<typeof quoteDecisionAction>

const id = z.string().trim().min(1).max(160)
/** Original stored decision only; no public token, replay token or credentials. */
export const quoteDecisionReceipt = z
  .object({
    kind: z.literal("commerce_quote_decision"),
    recordId: id,
    quoteId: id,
    quoteVersionId: id,
    decision: z.enum(["approved", "rejected"]),
    policyRevision: z.number().int().nonnegative(),
    decidedAt: z.string().datetime({ offset: true }),
    decidedByMembershipId: id,
    reason,
    releaseState: z.enum(["released", "rejected"]),
    title: z.string().max(160),
    detail: z.string().max(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.decision === "approved") !== (value.releaseState === "released"))
      ctx.addIssue({
        code: "custom",
        path: ["releaseState"],
        message: "Keep the original decision and release outcome together.",
      })
  })

/** A receipt opens only its recorded original tuple, never the latest quotation. */
export function quoteDecisionReceiptTarget(raw: unknown) {
  const saved = quoteDecisionReceipt.safeParse(raw)
  return saved.success
    ? quoteApprovalTargetSchema.parse({
        kind: "commerce_quote_approval",
        approvalId: saved.data.recordId,
        quoteId: saved.data.quoteId,
        quoteVersionId: saved.data.quoteVersionId,
      })
    : null
}
