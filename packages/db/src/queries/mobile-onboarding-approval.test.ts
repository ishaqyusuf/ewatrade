import { expect, test } from "bun:test"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { createMobileOwnerOtp, verifyMobileSocialIdentity } from "./mobile-auth"
import type { DbClient } from "./types"

test("hosted native signup cannot bypass approval through OTP or social auth", async () => {
  const previous = process.env.APP_ENV
  const publication = currentEffectiveLegalPublication()
  const input = {
    mode: "sign_up" as const,
    ageBand: "ADULT" as const,
    email: "approved-test@example.test",
    businessName: "Approved Test",
    legalVersion: publication?.version,
    acceptedTerms: true as const,
    acknowledgedPrivacyNotice: true as const,
  }
  // No database method should be reached before the missing-approval refusal.
  const db = {} as DbClient
  try {
    for (const mode of ["production", "preview"]) {
      process.env.APP_ENV = mode
      await expect(createMobileOwnerOtp(db, input)).rejects.toThrow(
        "Create your store",
      )
      await expect(
        verifyMobileSocialIdentity(db, {
          ...input,
          provider: "google",
          providerAccountId: "test-provider-subject",
        }),
      ).rejects.toThrow("Create your store")
    }
  } finally {
    // biome-ignore lint/performance/noDelete: process.env assignment coerces undefined into a string.
    if (previous === undefined) delete process.env.APP_ENV
    else process.env.APP_ENV = previous
  }
})
