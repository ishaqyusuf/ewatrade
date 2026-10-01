import { describe, expect, test } from "bun:test"
import {
  projectDurableReviewerAccess,
  projectDurableStoreAccess,
} from "./retail-ops-subscriptions"
const now = new Date("2026-09-24")
describe("store expiry enforcement without a webhook", () => {
  test("expired active store rows do not grant entitlement", () => {
    expect(
      projectDurableStoreAccess(
        { provider: "PLAY_STORE", status: "ACTIVE", currentPeriodEndsAt: now },
        now,
      ),
    ).toBe(false)
  })
  test("revoked store rows do not grant prepaid future access", () => {
    expect(
      projectDurableStoreAccess(
        {
          provider: "APP_STORE",
          status: "CANCELLED",
          currentPeriodEndsAt: new Date("2026-10-01"),
        },
        now,
      ),
    ).toBe(false)
  })
  test("valid prepaid access remains active", () => {
    expect(
      projectDurableStoreAccess(
        {
          provider: "APP_STORE",
          status: "ACTIVE",
          currentPeriodEndsAt: new Date("2026-10-01"),
        },
        now,
      ),
    ).toBe(true)
  })
  test("other billing providers preserve their existing policy", () => {
    expect(
      projectDurableStoreAccess(
        { provider: "STRIPE", status: "ACTIVE", currentPeriodEndsAt: null },
        now,
      ),
    ).toBeNull()
  })
})

describe("time-bounded Play reviewer access", () => {
  test("only the marked manual subscription grants access before expiry", () => {
    const valid = {
      billingSubscriptionId: "play-review:demo-tenant",
      currentPeriodEndsAt: new Date("2026-10-24"),
      provider: "MANUAL",
      status: "ACTIVE",
    }
    expect(projectDurableReviewerAccess(valid, now)).toBe(true)
    expect(
      projectDurableReviewerAccess({ ...valid, currentPeriodEndsAt: now }, now),
    ).toBe(false)
    expect(
      projectDurableReviewerAccess({ ...valid, status: "CANCELLED" }, now),
    ).toBe(false)
    expect(
      projectDurableReviewerAccess(
        { ...valid, billingSubscriptionId: "other" },
        now,
      ),
    ).toBeNull()
    expect(
      projectDurableReviewerAccess({ ...valid, provider: "STRIPE" }, now),
    ).toBeNull()
  })
})
