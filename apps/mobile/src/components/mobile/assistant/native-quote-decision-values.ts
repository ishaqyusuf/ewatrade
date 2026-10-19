import {
  type QuoteDecisionAction,
  quoteDecisionAction,
} from "@ewatrade/assistant/general/quote-decision"
import { nativeValidationMessage } from "./native-validation-copy"

export type NativeQuoteScope = {
  tenantId: string
  storeId: string
  actorUserId: string
}
export type NativeQuoteContext = {
  tenant: { id: string }
  activeStore: { id: string } | null
  actorUserId: string
}
export type NativeQuoteReview = NativeQuoteScope &
  QuoteDecisionAction & { lines: string[] }
export function nativeQuoteScopeMatches(
  current: NativeQuoteContext,
  expected: NativeQuoteScope,
) {
  return (
    current?.tenant?.id === expected.tenantId &&
    current?.activeStore?.id === expected.storeId &&
    current?.actorUserId === expected.actorUserId
  )
}
export function nativeQuoteDecisionDraft(
  initial: QuoteDecisionAction,
  raw: unknown,
) {
  const before = quoteDecisionAction.parse(initial)
  const next = quoteDecisionAction.parse(raw)
  if (
    next.action !== before.action ||
    next.approvalId !== before.approvalId ||
    next.quoteId !== before.quoteId ||
    next.quoteVersionId !== before.quoteVersionId
  )
    throw Error("The original quotation decision changed. Open a new draft.")
  return next
}
export function nativeQuoteReviewMatches(
  review: NativeQuoteReview,
  scope: NativeQuoteScope,
  draft: QuoteDecisionAction,
) {
  return (
    review.tenantId === scope.tenantId &&
    review.storeId === scope.storeId &&
    review.actorUserId === scope.actorUserId &&
    review.action === draft.action &&
    review.approvalId === draft.approvalId &&
    review.quoteId === draft.quoteId &&
    review.quoteVersionId === draft.quoteVersionId &&
    review.reason === draft.reason &&
    Array.isArray(review.lines) &&
    review.lines.every((line) => typeof line === "string")
  )
}
export function createNativeQuoteScopeFence() {
  let current = ""
  let mounted = true
  return {
    update(scope: string) {
      current = scope
    },
    activate() {
      mounted = true
    },
    dispose() {
      mounted = false
    },
    isCurrent(scope: string) {
      return mounted && current === scope
    },
  }
}
/** Each draft owns its fresh protected reads and UI callbacks; no domain command. */
export function createNativeQuoteDecisionSave() {
  let active = true
  let generation = 0
  let owner: { onBusy: (pending: boolean) => void } | null = null
  return {
    activate() {
      active = true
    },
    cancel() {
      generation++
      const previous = owner
      owner = null
      if (active) previous?.onBusy(false)
    },
    dispose() {
      active = false
      generation++
      owner = null
    },
    async save(options: {
      initial: QuoteDecisionAction
      raw: unknown
      scope: NativeQuoteScope
      isCurrent: () => boolean
      fetchScope: () => Promise<NativeQuoteContext>
      fetchReview: (draft: QuoteDecisionAction) => Promise<NativeQuoteReview>
      onSave: (draft: QuoteDecisionAction) => void
      onError: (message: string, stage: "input" | "scope" | "review") => void
      onBusy: (pending: boolean) => void
    }) {
      if (!active || owner || !options.isCurrent()) return
      const token = { onBusy: options.onBusy }
      owner = token
      const started = generation
      const current = () =>
        active && generation === started && options.isCurrent()
      options.onBusy(true)
      let stage: "input" | "scope" | "review" = "input"
      try {
        const draft = nativeQuoteDecisionDraft(options.initial, options.raw)
        stage = "scope"
        const context = await options.fetchScope()
        if (!current()) return
        if (!nativeQuoteScopeMatches(context, options.scope))
          throw Error(
            "The current business, Store or actor changed. Open the draft again.",
          )
        stage = "review"
        const review = await options.fetchReview(draft)
        if (!current()) return
        if (!nativeQuoteReviewMatches(review, options.scope, draft))
          throw Error(
            "The fresh review does not match this original quotation decision.",
          )
        options.onSave(draft)
      } catch (cause) {
        if (current())
          options.onError(
            nativeValidationMessage(
              cause,
              "The current quotation review is unavailable.",
            ),
            stage,
          )
      } finally {
        if (owner === token) {
          owner = null
          if (current()) options.onBusy(false)
        }
      }
    },
  }
}
