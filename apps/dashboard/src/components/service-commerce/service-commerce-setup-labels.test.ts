import { describe, expect, test } from "bun:test"
import { SERVICE_COMMERCE_CAPABILITIES } from "@ewatrade/service-commerce"

import {
  SERVICE_COMMERCE_FEATURES,
  activationBlockerLabel,
  featureReadinessTag,
  plainSetupError,
} from "./service-commerce-setup-labels"

const capabilities = Object.fromEntries(
  SERVICE_COMMERCE_CAPABILITIES.map((capability) => [capability, false]),
) as Record<(typeof SERVICE_COMMERCE_CAPABILITIES)[number], boolean>

describe("Bookings and quotes settings copy", () => {
  test("lists every capability once, in the server's order", () => {
    expect(
      SERVICE_COMMERCE_FEATURES.map((feature) => feature.capability),
    ).toEqual([...SERVICE_COMMERCE_CAPABILITIES])
  })

  test("tags only switched-on features that need something", () => {
    const setup = {
      blockers: ["setup_incomplete" as const],
      readiness: "setup_required" as const,
      recovery: "manage_setup" as const,
    }
    expect(featureReadinessTag(true, setup)).toBe("Needs setup")
    expect(featureReadinessTag(false, setup)).toBeNull()
    expect(
      featureReadinessTag(true, {
        blockers: ["profile_disabled"],
        readiness: "unavailable",
        recovery: "manage_setup",
      }),
    ).toBeNull()
    expect(
      featureReadinessTag(true, {
        blockers: ["policy_restricted"],
        readiness: "restricted",
        recovery: "review_policy",
      }),
    ).toBe("Not allowed")
  })

  test("says what to do for each activation blocker", () => {
    expect(
      activationBlockerLabel("outcome_unavailable", {
        capabilities: { ...capabilities, quote: true },
      }),
    ).toBe("Finish setting up quotes")
    expect(
      activationBlockerLabel("channel_unavailable", { capabilities }),
    ).toBe("Set up a way for customers to reach you in Customer channels")
    expect(activationBlockerLabel("something_new", { capabilities })).toBe(
      "Finish the setup below",
    )
  })

  test("keeps internal codes out of save errors", () => {
    expect(
      plainSetupError(
        "Active Service Commerce settings are not ready: outcome_missing.",
      ),
    ).toBe(
      "This would stop bookings and quotes from working. Turn them off first, then change this.",
    )
    expect(
      plainSetupError(
        "Service Commerce settings changed. Refresh and try again.",
      ),
    ).toBe("These settings changed somewhere else. Refresh and try again.")
  })
})
