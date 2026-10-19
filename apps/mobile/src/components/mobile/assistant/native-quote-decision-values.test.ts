import { expect, test } from "bun:test"
import type { QuoteDecisionAction } from "@ewatrade/assistant/general/quote-decision"
import {
  type NativeQuoteContext,
  type NativeQuoteReview,
  createNativeQuoteDecisionSave,
  createNativeQuoteScopeFence,
  nativeQuoteDecisionDraft,
  nativeQuoteReviewMatches,
  nativeQuoteScopeMatches,
} from "./native-quote-decision-values"
const initial: QuoteDecisionAction = {
  action: "commerce_quote_approve",
  approvalId: "approval",
  quoteId: "quote",
  quoteVersionId: "version",
  reason: "Initial reason",
}
const scope = { tenantId: "business", storeId: "store", actorUserId: "actor" }
const context: NativeQuoteContext = {
  tenant: { id: "business" },
  activeStore: { id: "store" },
  actorUserId: "actor",
}
const review = (draft = initial): NativeQuoteReview => ({
  ...scope,
  ...draft,
  lines: ["Exact reviewed effects"],
})
test("only the reason can change; action and approval/Quote/Version identities remain fixed", () => {
  expect(
    nativeQuoteDecisionDraft(initial, {
      ...initial,
      reason: " Edited reason ",
    }),
  ).toEqual({ ...initial, reason: "Edited reason" })
  for (const patch of [
    { action: "commerce_quote_reject" },
    { approvalId: "other" },
    { quoteId: "other" },
    { quoteVersionId: "other" },
    { tenantId: "other" },
    { actorUserId: "other" },
    { expectedPolicyRevision: 2 },
    { reason: "" },
    { reason: "x".repeat(501) },
  ])
    expect(() =>
      nativeQuoteDecisionDraft(initial, { ...initial, ...patch }),
    ).toThrow()
})
test("scope and fresh review match all exact auth, tuple and intent fields", () => {
  expect(nativeQuoteScopeMatches(context, scope)).toBe(true)
  for (const patch of [
    { tenant: { id: "other" } },
    { activeStore: { id: "other" } },
    { activeStore: null },
    { actorUserId: "other" },
  ])
    expect(nativeQuoteScopeMatches({ ...context, ...patch }, scope)).toBe(false)
  expect(nativeQuoteReviewMatches(review(), scope, initial)).toBe(true)
  for (const patch of [
    { tenantId: "other" },
    { storeId: "other" },
    { actorUserId: "other" },
    { approvalId: "other" },
    { quoteId: "other" },
    { quoteVersionId: "other" },
    { action: "commerce_quote_reject" as const },
    { reason: "other" },
  ])
    expect(
      nativeQuoteReviewMatches({ ...review(), ...patch }, scope, initial),
    ).toBe(false)
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function harness() {
  const saver = createNativeQuoteDecisionSave()
  const pending = deferred<NativeQuoteReview>()
  const saves: QuoteDecisionAction[] = []
  const busy: boolean[] = []
  const errors: { message: string; stage: string }[] = []
  let reads = 0
  let allowed = true
  const options = {
    initial,
    raw: { ...initial, reason: "Changed reason" },
    scope,
    isCurrent: () => allowed,
    fetchScope: async () => context,
    fetchReview: async () => {
      reads++
      return pending.promise
    },
    onSave: (payload: QuoteDecisionAction) => saves.push(payload),
    onBusy: (v: boolean) => busy.push(v),
    onError: (message: string, stage: string) =>
      errors.push({ message, stage }),
  }
  return {
    saver,
    pending,
    saves,
    busy,
    errors,
    options,
    reads: () => reads,
    disable: () => {
      allowed = false
    },
  }
}
test("Save obtains actual current scope then fresh changed-reason review once for double press", async () => {
  const h = harness()
  const p = h.saver.save(h.options)
  await h.saver.save(h.options)
  await Promise.resolve()
  expect(h.reads()).toBe(1)
  expect(h.saves).toEqual([])
  h.pending.resolve(review({ ...initial, reason: "Changed reason" }))
  await p
  expect(h.saves).toEqual([{ ...initial, reason: "Changed reason" }])
  expect(h.busy).toEqual([true, false])
})
test("foreign current context prevents review, mismatched review prevents emission, reason validation is local", async () => {
  const h = harness()
  await h.saver.save({
    ...h.options,
    fetchScope: async () => ({ ...context, actorUserId: "foreign" }),
  })
  expect(h.reads()).toBe(0)
  expect(h.errors.at(-1)?.stage).toBe("scope")
  await h.saver.save({ ...h.options, raw: { ...initial, reason: "" } })
  expect(h.errors.at(-1)?.stage).toBe("input")
  await h.saver.save({ ...h.options, fetchReview: async () => review() })
  expect(h.errors.at(-1)?.stage).toBe("review")
  expect(h.saves).toEqual([])
})
test("synchronous role/business/draft scope fence drops late results before passive cleanup", async () => {
  for (const changed of ["role", "business", "draft"]) {
    const h = harness()
    const fence = createNativeQuoteScopeFence()
    fence.update("old")
    const p = h.saver.save({
      ...h.options,
      isCurrent: () => fence.isCurrent("old"),
    })
    await Promise.resolve()
    fence.update(changed)
    h.pending.resolve(review({ ...initial, reason: "Changed reason" }))
    await p
    expect(h.saves).toEqual([])
    expect(h.errors).toEqual([])
    expect(h.busy).toEqual([true])
  }
})
test("disabled, unmounted or cancelled review cannot emit stale callbacks", async () => {
  for (const stop of [
    (h: ReturnType<typeof harness>) => h.disable(),
    (h: ReturnType<typeof harness>) => h.saver.dispose(),
    (h: ReturnType<typeof harness>) => h.saver.cancel(),
  ]) {
    const h = harness()
    const p = h.saver.save(h.options)
    await Promise.resolve()
    stop(h)
    h.pending.resolve(review({ ...initial, reason: "Changed reason" }))
    await p
    expect(h.saves).toEqual([])
    expect(h.errors).toEqual([])
  }
})
test("cancel or StrictMode lifetime resets ownership so old finally cannot clear newer busy state", async () => {
  for (const dispose of [false, true]) {
    const h = harness()
    const old = h.saver.save(h.options)
    await Promise.resolve()
    if (dispose) {
      h.saver.dispose()
      h.saver.activate()
    } else h.saver.cancel()
    const next = deferred<NativeQuoteReview>()
    const busy: boolean[] = []
    const newer = h.saver.save({
      ...h.options,
      fetchReview: () => next.promise,
      onBusy: (v) => busy.push(v),
    })
    await Promise.resolve()
    h.pending.resolve(review({ ...initial, reason: "Changed reason" }))
    await old
    expect(busy).toEqual([true])
    expect(h.saves).toEqual([])
    next.resolve(review({ ...initial, reason: "Changed reason" }))
    await newer
    expect(busy).toEqual([true, false])
    expect(h.saves).toHaveLength(1)
  }
})
test("protected refusal reports the review stage without inventing a successful proposal", async () => {
  const h = harness()
  await h.saver.save({
    ...h.options,
    fetchReview: async () => {
      throw Error("Maker-checker requires another approver")
    },
  })
  expect(h.saves).toEqual([])
  expect(h.errors).toEqual([
    { message: "Maker-checker requires another approver", stage: "review" },
  ])
  expect(h.busy).toEqual([true, false])
})
