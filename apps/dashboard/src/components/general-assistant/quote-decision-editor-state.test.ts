import { expect, test } from "bun:test"
import {
  parseQuoteDecisionEditorDraft,
  quoteDecisionReviewMatches,
  quoteDecisionReviewKey,
  quoteDecisionEditorReadState,
} from "./quote-decision-editor-state"
import type { QuoteDecisionAction } from "@ewatrade/assistant/general/quote-decision"
const initial: QuoteDecisionAction = {
  action: "commerce_quote_approve",
  approvalId: "original-approval",
  quoteId: "original-quote",
  quoteVersionId: "original-version",
  reason: "Stated reason",
}
const scope = { tenantId: "tenant", storeId: "store", actorUserId: "checker" }
const fresh = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  isFetchedAfterMount: true,
}

test("quotation editor isolates actor, Store, original tuple, decision and reason in review/cache identity", () => {
  expect(
    quoteDecisionReviewMatches({ ...scope, ...initial }, scope, initial),
  ).toBe(true)
  for (const field of ["tenantId", "storeId", "actorUserId"] as const) {
    const changed = { ...scope, [field]: "changed" }
    expect(
      quoteDecisionReviewMatches({ ...scope, ...initial }, changed, initial),
    ).toBe(false)
    expect(quoteDecisionReviewKey(changed, initial)).not.toEqual(
      quoteDecisionReviewKey(scope, initial),
    )
  }
  for (const field of [
    "approvalId",
    "quoteId",
    "quoteVersionId",
    "reason",
  ] as const) {
    const changed = { ...initial, [field]: "changed" }
    expect(
      quoteDecisionReviewMatches({ ...scope, ...initial }, scope, changed),
    ).toBe(false)
    expect(quoteDecisionReviewKey(scope, changed)).not.toEqual(
      quoteDecisionReviewKey(scope, initial),
    )
  }
  const rejected: QuoteDecisionAction = {
    ...initial,
    action: "commerce_quote_reject",
  }
  expect(
    quoteDecisionReviewMatches({ ...scope, ...initial }, scope, rejected),
  ).toBe(false)
  expect(quoteDecisionReviewKey(scope, rejected)).not.toEqual(
    quoteDecisionReviewKey(scope, initial),
  )
  expect(quoteDecisionReviewKey(null, initial)).not.toEqual(
    quoteDecisionReviewKey(scope, initial),
  )
})
test("editor changes only the stated reason; preserves original decision and IDs without model authority", () => {
  expect(
    parseQuoteDecisionEditorDraft(initial, {
      ...initial,
      reason: "  New explicit reason  ",
    }),
  ).toEqual({ ...initial, reason: "New explicit reason" })
  for (const field of ["approvalId", "quoteId", "quoteVersionId"] as const)
    expect(() =>
      parseQuoteDecisionEditorDraft(initial, {
        ...initial,
        [field]: "different",
      }),
    ).toThrow()
  expect(() =>
    parseQuoteDecisionEditorDraft(initial, {
      ...initial,
      action: "commerce_quote_reject",
    }),
  ).toThrow()
  expect(() =>
    parseQuoteDecisionEditorDraft(initial, { ...initial, tenantId: "forged" }),
  ).toThrow()
})
test("pre-mount cache, refetch, pause and failure withhold quotation effects until fresh review", () => {
  expect(quoteDecisionEditorReadState([fresh, fresh])).toBe("ready")
  for (const field of ["isPending", "isFetching"] as const)
    expect(
      quoteDecisionEditorReadState([fresh, { ...fresh, [field]: true }]),
    ).toBe("loading")
  expect(
    quoteDecisionEditorReadState([
      fresh,
      { ...fresh, isFetchedAfterMount: false },
    ]),
  ).toBe("loading")
  expect(
    quoteDecisionEditorReadState([
      { ...fresh, isFetchedAfterMount: false },
      fresh,
    ]),
  ).toBe("loading")
  expect(
    quoteDecisionEditorReadState([fresh, { ...fresh, isPaused: true }]),
  ).toBe("paused")
  expect(
    quoteDecisionEditorReadState([fresh, { ...fresh, isError: true }]),
  ).toBe("unavailable")
})
