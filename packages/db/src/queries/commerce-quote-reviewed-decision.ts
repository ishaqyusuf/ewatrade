import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { Prisma } from "../../generated/prisma/client"
import {
  type QuoteDecisionReviewInput,
  prepareReviewedQuoteDecisionInTransaction,
} from "./commerce-quote-decision-review"
import {
  CommerceQuoteError,
  type PreparedCommerceQuoteApproval,
  prepareCommerceQuoteApproval,
} from "./commerce-quotes"

type Publication = NonNullable<
  ReturnType<typeof currentEffectiveLegalPublication>
>
type Scope = Pick<
  QuoteDecisionReviewInput,
  "actorUserId" | "tenantId" | "storeId"
>
type Review = Awaited<
  ReturnType<typeof prepareReviewedQuoteDecisionInTransaction>
>
type PlanState = {
  input: QuoteDecisionReviewInput
  clientDecisionId: string
  target: Review["target"]
  source: { id: string; kind: "service_request" | "commerce_inquiry" }
  options: Array<{
    label: string
    customerNote: string | null | undefined
    fulfilmentPromise: string | null | undefined
    lines: Array<{ customerNote: string }>
  }>
  versionTexts: {
    customerNote: string | null
    fulfilmentPromise: string | null
  }
  policyRevision: number
  publication: Publication | null
}
declare const reviewedApprovalPlan: unique symbol
export type ReviewedCommerceQuoteApprovalPlan = {
  readonly [reviewedApprovalPlan]: true
}
declare const reviewedApproval: unique symbol
export type ReviewedCommerceQuoteApproval = {
  readonly [reviewedApproval]: true
}
const plans = new WeakMap<ReviewedCommerceQuoteApprovalPlan, PlanState>()
const preparing = new WeakMap<
  ReviewedCommerceQuoteApprovalPlan,
  Promise<ReviewedCommerceQuoteApproval>
>()
const preparations = new WeakMap<
  ReviewedCommerceQuoteApproval,
  { state: PlanState; native: PreparedCommerceQuoteApproval }
>()

function refuse(): never {
  throw new CommerceQuoteError(
    "QUOTE_CONFLICT",
    "This exact quotation approval changed or requires a fresh complete review.",
  )
}

/**
 * Pending approval only. The caller first proves fresh GENERAL/session/proposal
 * authority and handles terminal/cancel paths. No transaction or execute closure
 * is retained; completed receipt recovery must never call this preparation path.
 */
export async function inspectReviewedCommerceQuoteApprovalInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<QuoteDecisionReviewInput, "decision">,
  clientDecisionId: string,
  publication: Publication | null = currentEffectiveLegalPublication(),
) {
  if (
    !clientDecisionId ||
    clientDecisionId !== clientDecisionId.trim() ||
    clientDecisionId.length > 191
  )
    refuse()
  const snapshot: QuoteDecisionReviewInput = {
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    storeId: input.storeId,
    approvalId: input.approvalId,
    quoteId: input.quoteId,
    quoteVersionId: input.quoteVersionId,
    decision: "approve",
    reason: input.reason,
  }
  const legal = structuredClone(publication)
  const { target, review } = await prepareReviewedQuoteDecisionInTransaction(
    tx,
    snapshot,
    legal,
  )
  if (!["service", "commerce_inquiry"].includes(review.detail.sourceKind))
    refuse()
  if (!review.releaseVersionText) refuse()
  const state: PlanState = {
    input: structuredClone(snapshot),
    clientDecisionId,
    target: structuredClone(target),
    source: {
      id: review.detail.sourceId,
      kind:
        review.detail.sourceKind === "service"
          ? "service_request"
          : "commerce_inquiry",
    },
    policyRevision: review.detail.policyRevision,
    publication: legal,
    versionTexts: structuredClone(review.releaseVersionText),
    options: review.releaseText.map((option) => ({
      label: option.label,
      customerNote: option.customerNote,
      fulfilmentPromise: option.fulfilmentPromise,
      lines: option.lineNotes.map((customerNote) => ({ customerNote })),
    })),
  }
  const plan = Object.freeze({}) as ReviewedCommerceQuoteApprovalPlan
  plans.set(plan, state)
  return { target: structuredClone(target), plan }
}

/** End the inspection transaction before calling; configured screening runs here. */
export async function prepareReviewedCommerceQuoteApproval(
  plan: ReviewedCommerceQuoteApprovalPlan,
) {
  const state = plans.get(plan)
  if (!state) refuse()
  const pending = preparing.get(plan)
  if (pending) return pending
  const work = (async () => {
    const native = await prepareCommerceQuoteApproval(
      {
        ...state.input,
        clientDecisionId: state.clientDecisionId,
        expectedPolicyRevision: state.policyRevision,
      },
      state.source,
      state.options,
      state.publication,
      state.versionTexts,
    )
    const prepared = Object.freeze({}) as ReviewedCommerceQuoteApproval
    preparations.set(prepared, { state, native })
    return prepared
  })()
  preparing.set(plan, work)
  return work
}

/** Fresh current caller authority and a final owning Serializable TX are required. */
export async function approveReviewedCommerceQuoteInTransaction(
  tx: Prisma.TransactionClient,
  scope: Scope,
  prepared: ReviewedCommerceQuoteApproval,
  publication: Publication | null = currentEffectiveLegalPublication(),
) {
  const preparation = preparations.get(prepared)
  if (!preparation) refuse()
  const { state, native } = preparation
  if (
    scope.actorUserId !== state.input.actorUserId ||
    scope.tenantId !== state.input.tenantId ||
    scope.storeId !== state.input.storeId ||
    JSON.stringify(publication) !== JSON.stringify(state.publication)
  )
    refuse()
  const fresh = await prepareReviewedQuoteDecisionInTransaction(
    tx,
    state.input,
    publication,
  )
  if (
    fresh.target.id !== state.target.id ||
    fresh.target.revision !== state.target.revision
  )
    refuse()
  return fresh.execute(state.clientDecisionId, native)
}
