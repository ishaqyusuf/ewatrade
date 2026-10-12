import {
  quoteDecisionAction,
  type QuoteDecisionAction,
} from "@ewatrade/assistant/general/quote-decision"

export type QuoteDecisionScope = {
  tenantId: string
  storeId: string
  actorUserId: string
}
type Review = QuoteDecisionScope & {
  approvalId: string
  quoteId: string
  quoteVersionId: string
  action: QuoteDecisionAction["action"]
  reason: string
}
export function quoteDecisionReviewMatches(
  review: Review,
  scope: QuoteDecisionScope,
  action: QuoteDecisionAction,
) {
  return (
    review.tenantId === scope.tenantId &&
    review.storeId === scope.storeId &&
    review.actorUserId === scope.actorUserId &&
    review.approvalId === action.approvalId &&
    review.quoteId === action.quoteId &&
    review.quoteVersionId === action.quoteVersionId &&
    review.action === action.action &&
    review.reason === action.reason
  )
}
export function parseQuoteDecisionEditorDraft(
  initial: QuoteDecisionAction,
  raw: unknown,
) {
  const value = quoteDecisionAction.parse(raw)
  if (
    value.action !== initial.action ||
    value.approvalId !== initial.approvalId ||
    value.quoteId !== initial.quoteId ||
    value.quoteVersionId !== initial.quoteVersionId
  )
    throw new Error(
      "The original quotation decision changed. Open a new draft.",
    )
  return value
}

export function quoteDecisionReviewKey(
  scope: QuoteDecisionScope | null,
  action: QuoteDecisionAction,
) {
  return [
    "assistant-quote-decision-review",
    scope?.tenantId ?? null,
    scope?.storeId ?? null,
    scope?.actorUserId ?? null,
    action.approvalId,
    action.quoteId,
    action.quoteVersionId,
    action.action,
    action.reason,
  ] as const
}
type FreshRead = {
  isPending: boolean
  isFetching: boolean
  isPaused: boolean
  isError: boolean
  isSuccess: boolean
  isFetchedAfterMount: boolean
}
export function quoteDecisionEditorReadState(reads: FreshRead[]) {
  if (reads.some((read) => read.isError)) return "unavailable"
  if (reads.some((read) => read.isPaused)) return "paused"
  if (
    reads.some(
      (read) =>
        read.isPending ||
        read.isFetching ||
        !read.isSuccess ||
        !read.isFetchedAfterMount,
    )
  )
    return "loading"
  return "ready"
}
