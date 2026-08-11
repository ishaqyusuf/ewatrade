import { describe, expect, test } from "bun:test"

import {
  parseServiceCommerceLiveCanaryArgs,
  runServiceCommerceLiveCanaryPreflight,
} from "./service-commerce-live-canary"

describe("Service Commerce live-canary CLI", () => {
  test("parses only presence flags and does not accept opaque values", () => {
    expect(
      parseServiceCommerceLiveCanaryArgs([
        "--kind",
        "meta_whatsapp",
        "--production-profile-confirmed",
        "--tenant-reference-present",
        "--store-reference-present",
      ]),
    ).toEqual({
      evidence: {
        productionProfileConfirmed: true,
        storeReferencePresent: true,
        tenantReferencePresent: true,
      },
      kind: "meta_whatsapp",
    })
    expect(() =>
      parseServiceCommerceLiveCanaryArgs(["--tenant-id", "tenant-secret"]),
    ).toThrow("Unsupported live-canary option.")
  })

  test("returns a redacted blocked result for an incomplete offline preflight", () => {
    const result = runServiceCommerceLiveCanaryPreflight(
      ["--kind", "meta_whatsapp"],
      { APP_ENV: "production" },
    )

    expect(result).toMatchObject({
      executionAuthorized: false,
      kind: "meta_whatsapp",
      status: "BLOCKED",
    })
    expect(result.missingEnvironmentKeys).toEqual(
      expect.arrayContaining(["DATABASE_PROFILE_VERIFIED", "DATABASE_URL"]),
    )
  })
})
