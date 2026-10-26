import { expect, test } from "bun:test"
import {
  resolveRetailOpsPlanId,
  withOwnerSignupLaunchGrant,
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
