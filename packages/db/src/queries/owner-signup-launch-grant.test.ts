import { expect, test } from "bun:test"
import {
  resolveRetailOpsPlanId,
  withOwnerSignupLaunchGrant,
  withOwnerSignupSubscription,
} from "./retail-ops-subscriptions"

test("signup launch provenance uses canonical entitlement metadata with billing precedence and revocation", () => {
  const metadata = withOwnerSignupLaunchGrant(
    { keep: true },
    "growth",
    new Date("2026-10-18T00:00:00Z"),
  )
  expect(metadata).toMatchObject({ keep: true })
  expect(metadata.retailOps.subscription.source).toBe("owner_signup_launch")
  expect(resolveRetailOpsPlanId({ metadata })).toBe("growth")
  expect(
    resolveRetailOpsPlanId({
      metadata,
      subscription: { plan: { key: "pro" } },
    }),
  ).toBe("pro")
  expect(
    resolveRetailOpsPlanId({
      metadata: {
        ...metadata,
        retailOps: {
          ...metadata.retailOps,
          subscription: {
            ...metadata.retailOps.subscription,
            revokedAt: "2026-10-19T00:00:00Z",
          },
        },
      },
    }),
  ).toBe("starter")
})

test("paid signups have a versioned Free baseline, survive disabled-gate retries and preserve old grants", () => {
  const old = {
    enabled: process.env.OWNER_BILLING_ENABLED,
    environment: process.env.STORE_BILLING_ENVIRONMENT,
  }
  try {
    process.env.OWNER_BILLING_ENABLED = "true"
    process.env.STORE_BILLING_ENVIRONMENT = "sandbox"
    const metadata = withOwnerSignupSubscription({ keep: true }, "pro")
    expect(metadata).toMatchObject({
      keep: true,
      retailOps: {
        billingPolicy: "owner-subscriptions-v1",
        subscription: {
          planId: "free",
          source: "owner_billing_free",
          requestedPlanId: "pro",
        },
      },
    })
    expect(resolveRetailOpsPlanId({ metadata })).toBe("free")
    const grant = withOwnerSignupLaunchGrant({ keep: true }, "growth")
    expect(withOwnerSignupSubscription(grant, "starter")).toEqual(grant)
    process.env.OWNER_BILLING_ENABLED = "false"
    expect(
      resolveRetailOpsPlanId({
        metadata: withOwnerSignupSubscription(metadata, "growth"),
      }),
    ).toBe("free")
    expect(
      resolveRetailOpsPlanId({
        metadata: withOwnerSignupSubscription({}, "growth"),
      }),
    ).toBe("growth")
  } finally {
    for (const [key, value] of [
      ["OWNER_BILLING_ENABLED", old.enabled],
      ["STORE_BILLING_ENVIRONMENT", old.environment],
    ] as const) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})
