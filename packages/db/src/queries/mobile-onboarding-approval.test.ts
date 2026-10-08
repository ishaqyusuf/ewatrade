import { expect, test } from "bun:test"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { createMobileOwnerOtp } from "./mobile-auth"
import type { DbClient } from "./types"

test("hosted native signup no longer needs early-access approval", async () => {
  const previous = process.env.APP_ENV
  const publication = currentEffectiveLegalPublication()
  const created: unknown[] = []
  const db = {
    verification: {
      async create(args: unknown) {
        created.push(args)
        return args
      },
      async deleteMany() {
        return { count: 0 }
      },
    },
  } as unknown as DbClient
  try {
    for (const mode of ["production", "preview"]) {
      process.env.APP_ENV = mode
      const otp = await createMobileOwnerOtp(db, {
        mode: "sign_up",
        ageBand: "ADULT",
        email: "open-signup@example.test",
        businessName: "Open Signup Test",
        legalVersion: publication?.version,
        acceptedTerms: true,
        acknowledgedPrivacyNotice: true,
      })
      expect(otp.email).toBe("open-signup@example.test")
    }
    expect(created).toHaveLength(2)
  } finally {
    // biome-ignore lint/performance/noDelete: process.env assignment coerces undefined into a string.
    if (previous === undefined) delete process.env.APP_ENV
    else process.env.APP_ENV = previous
  }
})
