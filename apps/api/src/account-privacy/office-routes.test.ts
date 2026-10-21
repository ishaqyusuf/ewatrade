import { expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import type { PrismaClient } from "@ewatrade/db"
import { createOfficePrivacyRoutes } from "./office-routes"

test("signed fulfillment operations reach their guarded handlers and reject read-only actors", async () => {
  const keys = [
    "OVERSIGHT_PRIVACY_ENABLED",
    "OVERSIGHT_PRIVACY_KEY",
    "OVERSIGHT_PRIVACY_OPERATORS_JSON",
  ] as const
  const previous = keys.map((key) => process.env[key])
  const secret = "synthetic-office-route-key-not-a-real-credential"
  let databaseReads = 0
  const db = {
    user: {
      findUnique: async () => {
        databaseReads++
        return { id: "operator", emailVerified: true, isPlatformAdmin: true }
      },
    },
    accountPrivacyRequest: {
      findUnique: async () => {
        databaseReads++
        return null
      },
    },
  } as unknown as PrismaClient
  try {
    process.env.OVERSIGHT_PRIVACY_ENABLED = "true"
    process.env.OVERSIGHT_PRIVACY_KEY = secret
    process.env.OVERSIGHT_PRIVACY_OPERATORS_JSON = JSON.stringify({
      operator: {
        userId: "operator",
        scope: "process",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      reader: {
        userId: "reader",
        scope: "read",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    })
    const app = createOfficePrivacyRoutes(() => db)
    const base = {
      requestId: "missing-synthetic-case",
      commandId: "00000000-0000-4000-8000-000000000001",
      reason: "Synthetic handler dispatch regression test",
    }
    const cases = [
      ["review", { requestId: base.requestId }],
      [
        "externalReview",
        {
          ...base,
          expectedStep: "REVIEW_EXTERNAL_PROCESSORS",
          policyDigest: "a".repeat(64),
          confirmationsReviewed: true,
          receipts: [
            {
              provider: "synthetic-provider",
              evidenceDigest: "b".repeat(64),
              confirmedAt: new Date().toISOString(),
            },
          ],
        },
      ],
      [
        "sendNotice",
        {
          ...base,
          expectedStep: "DELIVER_OUTCOME",
          contentDigest: "c".repeat(64),
          contentReviewed: true,
        },
      ],
    ] as const
    for (const [operation, input] of cases) {
      for (const actorId of ["reader", "operator"]) {
        const before = databaseReads
        const body = JSON.stringify({
          version: 1,
          actorId,
          operation,
          issuedAt: new Date().toISOString(),
          input,
        })
        const response = await app.request("/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Oversight-Signature": createHmac("sha256", secret)
              .update(body)
              .digest("hex"),
          },
          body,
        })
        // A missing case must reach the canonical domain guard, not fail
        // envelope authentication or fall through to the advance schema.
        expect(response.status).toBe(actorId === "reader" ? 401 : 409)
        expect(databaseReads > before).toBe(actorId === "operator")
      }
    }
  } finally {
    keys.forEach((key, index) => {
      const value = previous[index]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
  }
})
