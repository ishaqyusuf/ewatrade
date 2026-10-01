import { describe, expect, test } from "bun:test"
import {
  assertPlayReviewExpiry,
  assertPlayReviewerOwnerEmail,
  assertPlayReviewerTarget,
} from "./play-reviewer-entitlement"

const owner = { user: { email: "review@example.test", emailVerified: true } }
const tenant = {
  id: "tenant-review",
  isActive: true,
  name: "EwaTrade Review Demo",
  slug: "ewatrade-review-demo",
  subscription: null,
  users: [owner],
}

describe("Play reviewer entitlement guards", () => {
  test("requires the owner-selected review mailbox", () => {
    expect(() =>
      assertPlayReviewerOwnerEmail(" FOUNDERS@EWATRADE.COM "),
    ).not.toThrow()
    expect(() => assertPlayReviewerOwnerEmail("other@example.test")).toThrow(
      "selected mailbox",
    )
  })
  test("allows only the exact isolated demo and verified owner", () => {
    expect(
      assertPlayReviewerTarget({
        action: "grant",
        expectedOwnerEmail: owner.user.email,
        tenant,
      }).tenantId,
    ).toBe(tenant.id)
    expect(() =>
      assertPlayReviewerTarget({
        action: "grant",
        expectedOwnerEmail: owner.user.email,
        tenant: { ...tenant, slug: "ordinary-business" },
      }),
    ).toThrow()
    expect(() =>
      assertPlayReviewerTarget({
        action: "grant",
        expectedOwnerEmail: owner.user.email,
        tenant: {
          ...tenant,
          users: [{ user: { ...owner.user, emailVerified: false } }],
        },
      }),
    ).toThrow()
  })

  test("never overwrites unrelated subscriptions and revokes only its own", () => {
    const unrelated = {
      ...tenant,
      subscription: {
        provider: "PLAY_STORE",
        billingSubscriptionId: "purchase-1",
      },
    }
    expect(() =>
      assertPlayReviewerTarget({
        action: "grant",
        expectedOwnerEmail: owner.user.email,
        tenant: unrelated,
      }),
    ).toThrow()
    expect(() =>
      assertPlayReviewerTarget({
        action: "revoke",
        expectedOwnerEmail: owner.user.email,
        tenant,
      }),
    ).toThrow()
    const review = {
      ...tenant,
      subscription: {
        provider: "MANUAL",
        billingSubscriptionId: "play-review:tenant-review",
      },
    }
    expect(
      assertPlayReviewerTarget({
        action: "revoke",
        expectedOwnerEmail: owner.user.email,
        tenant: review,
      }).subscriptionId,
    ).toBe("play-review:tenant-review")
  })

  test("bounds access to a review window", () => {
    const now = new Date("2026-09-24T00:00:00Z")
    expect(() =>
      assertPlayReviewExpiry(new Date("2026-10-24T00:00:00Z"), now),
    ).not.toThrow()
    expect(() =>
      assertPlayReviewExpiry(new Date("2026-09-24T00:00:00Z"), now),
    ).toThrow()
    expect(() =>
      assertPlayReviewExpiry(new Date("2027-09-24T00:00:00Z"), now),
    ).toThrow()
  })
})
