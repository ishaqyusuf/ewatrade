import { describe, expect, test } from "bun:test"

import { runStoreConversationCredentialExpiry } from "./store-conversation-credential-expiry"

describe("Store Conversation credential expiry schedule", () => {
  test("processes a bounded identifier-only page and isolates failures", async () => {
    const expired: string[] = []
    const result = await runStoreConversationCredentialExpiry(
      {
        expire: async ({ credentialId }) => {
          if (credentialId === "credential_2") throw new Error("retry later")
          expired.push(credentialId)
        },
        list: async ({ limit }) => {
          expect(limit).toBe(100)
          return [
            { credentialId: "credential_1" },
            { credentialId: "credential_2" },
          ]
        },
      },
      new Date("2026-08-23T12:00:00.000Z"),
    )

    expect(result).toEqual({ expired: 1, failed: 1 })
    expect(expired).toEqual(["credential_1"])
  })
})
