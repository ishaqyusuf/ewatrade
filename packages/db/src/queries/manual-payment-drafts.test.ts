import { expect, test } from "bun:test"
import { manualDraftCancellationDisposition } from "./manual-payment-drafts"

test("DRAFT closure is revision-bound and repeatable without inventing a bank decision", () => {
  const draft = { status: "DRAFT", revision: 1, draftCancelledAt: null }
  expect(manualDraftCancellationDisposition(draft, 1)).toBe("cancel")
  expect(() => manualDraftCancellationDisposition(draft, 2)).toThrow("changed")
  const closed = { ...draft, revision: 2, draftCancelledAt: new Date() }
  expect(manualDraftCancellationDisposition(closed, 1)).toBe("replay")
  expect(closed.status).toBe("DRAFT")
})
test("submitted/decided evidence cannot be discarded through the draft-cancellation command", () => {
  for (const status of ["SUBMITTED", "CONFIRMED", "NOT_RECEIVED"])
    expect(() =>
      manualDraftCancellationDisposition(
        { status, revision: 2, draftCancelledAt: null },
        2,
      ),
    ).toThrow("submitted")
})
