import { describe, expect, test } from "bun:test"
import {
  emptyPaymentNotificationPolicy,
  paymentNotificationChannelEligibility,
  paymentNotificationPeriod,
  paymentNotificationPlanIds,
  paymentNotificationPolicySchema,
  paymentNotificationPolicyWriteSchema,
  paymentNotificationTierChanged,
} from "./payment-report-notification-policy"

describe("payment-report plan policy admission", () => {
  test("all four tiers fail closed by default and defaults do not alias", () => {
    const policy = emptyPaymentNotificationPolicy()
    for (const planId of paymentNotificationPlanIds)
      for (const channel of ["email", "whatsapp"] as const) {
        const result = paymentNotificationChannelEligibility({
          policy,
          planId,
          channel,
          used: 0,
          reserved: 0,
        })
        expect(result.available).toBe(false)
        expect(result.budget).toEqual({ kind: "limited", limit: 0 })
      }
    policy.tiers.starter.email.enabled = true
    expect(policy.tiers.free.email.enabled).toBe(false)
  })
  test("missing, invalid caps and implicit unlimited are rejected", () => {
    const p = emptyPaymentNotificationPolicy()
    for (const limit of [
      undefined,
      -1,
      0.5,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "100",
    ]) {
      expect(
        paymentNotificationPolicySchema.safeParse({
          ...p,
          tiers: {
            ...p.tiers,
            pro: { ...p.tiers.pro, email: { enabled: true, limit } },
          },
        }).success,
      ).toBe(false)
    }
    expect(
      paymentNotificationPolicyWriteSchema.safeParse({
        commandId: crypto.randomUUID(),
        expectedRevision: 0,
        tiers: p.tiers,
        reason: "short",
      }).success,
    ).toBe(false)
  })
  test("reserved capacity counts; zero blocks; explicit unlimited keeps usage", () => {
    const policy = emptyPaymentNotificationPolicy()
    policy.tiers.growth.whatsapp = { enabled: true, limit: 250 }
    const read = () =>
      paymentNotificationChannelEligibility({
        policy,
        planId: "growth",
        channel: "whatsapp",
        used: 246,
        reserved: 4,
      })
    expect(read()).toMatchObject({
      available: false,
      remaining: 0,
      reason: "quota_exhausted",
      used: 246,
      reserved: 4,
    })
    policy.tiers.growth.whatsapp.limit = null
    expect(read()).toMatchObject({
      available: true,
      budget: { kind: "unlimited", limit: null },
      remaining: null,
      used: 246,
      reserved: 4,
    })
    policy.tiers.growth.whatsapp.limit = 0
    expect(read().available).toBe(false)
  })
  test("unknown usage is never zero or an unlimited grant", () => {
    const policy = emptyPaymentNotificationPolicy()
    policy.tiers.pro.email = { enabled: true, limit: null }
    expect(
      paymentNotificationChannelEligibility({
        policy,
        planId: "pro",
        channel: "email",
        used: null,
        reserved: null,
      }),
    ).toMatchObject({
      available: false,
      budget: { kind: "unknown", limit: null },
      used: null,
      reserved: null,
    })
    expect(
      paymentNotificationChannelEligibility({
        policy: null,
        planId: null,
        channel: "email",
        used: 0,
        reserved: 0,
        unavailableReason: "policy_missing",
      }).reason,
    ).toBe("policy_missing")
  })
  test("UTC calendar months include year/leap rollover and reject invalid time", () => {
    expect(paymentNotificationPeriod(new Date("2026-12-31T23:59:59Z"))).toEqual(
      {
        startsAt: "2026-12-01T00:00:00.000Z",
        resetsAt: "2027-01-01T00:00:00.000Z",
        timeZone: "UTC",
      },
    )
    expect(
      paymentNotificationPeriod(new Date("2028-02-29T23:59:59Z")).resetsAt,
    ).toBe("2028-03-01T00:00:00.000Z")
    expect(() => paymentNotificationPeriod(new Date(Number.NaN))).toThrow()
  })
  test("enable and cap changes both create effective-tier differences", () => {
    const a = emptyPaymentNotificationPolicy()
    const b = emptyPaymentNotificationPolicy()
    b.tiers.starter.email.enabled = true
    expect(paymentNotificationTierChanged(a, b, "starter")).toBe(true)
    expect(paymentNotificationTierChanged(a, b, "free")).toBe(false)
    b.tiers.free.whatsapp.limit = 200
    expect(paymentNotificationTierChanged(a, b, "free")).toBe(true)
  })
})
