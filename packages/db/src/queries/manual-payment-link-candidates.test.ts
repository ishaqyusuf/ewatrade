import { expect, test } from "bun:test"
import { latestLinkState } from "./manual-payment-link-candidates"

const now = new Date("2026-11-03T10:00:00Z")
const link = {
  amountMinor: 1_560_000,
  expiresAt: new Date("2026-11-03T12:00:00Z"),
  closedAt: null,
  reports: [],
}

test("an Order's latest link reports its state and claim counts only", () => {
  expect(latestLinkState(undefined, now)).toBeNull()
  expect(latestLinkState(link, now)).toEqual({
    state: "active",
    amountMinor: 1_560_000,
    expiresAt: link.expiresAt,
    reportsWaitingForReview: 0,
    reportsConfirmed: 0,
    reportsNotReceived: 0,
  })
  expect(
    latestLinkState(
      { ...link, expiresAt: new Date("2026-11-03T09:00:00Z") },
      now,
    )?.state,
  ).toBe("expired")
  expect(latestLinkState({ ...link, closedAt: now }, now)?.state).toBe("closed")
  const reported = latestLinkState(
    {
      ...link,
      reports: [
        { status: "SUBMITTED" },
        { status: "SUBMITTED" },
        { status: "CONFIRMED" },
        { status: "NOT_RECEIVED" },
      ],
    },
    now,
  )
  expect(reported).toMatchObject({
    reportsWaitingForReview: 2,
    reportsConfirmed: 1,
    reportsNotReceived: 1,
  })
  expect(Object.keys(reported ?? {})).not.toContain("payerName")
})
