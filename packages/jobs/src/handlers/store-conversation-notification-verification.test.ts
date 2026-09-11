import { describe, expect, test } from "bun:test"

import { runStoreConversationNotificationVerification } from "./store-conversation-notification-verification"

const payload = {
  storeId: "store-1",
  tenantId: "tenant-1",
  verificationId: "verification-1",
}

describe("Store Conversation notification verification", () => {
  test("sends the deterministic code only after a scoped email claim", async () => {
    const calls: Array<{ input: unknown; name: string }> = []
    const result = await runStoreConversationNotificationVerification(payload, {
      claim: async (input) => {
        calls.push({ input, name: "claim" })
        return {
          channel: "email",
          destinationCiphertext: "protected-recipient",
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          sendAttemptCount: 1,
          verificationId: payload.verificationId,
        }
      },
      complete: async (input) => {
        calls.push({ input, name: "complete" })
      },
      emailTransport: {
        send: async (input) => {
          calls.push({ input, name: "email" })
          return { provider: "email-test", providerMessageId: "message-1" }
        },
      },
      fail: async (input) => {
        calls.push({ input, name: "fail" })
      },
      resolveRecipient: (input) => {
        calls.push({ input, name: "resolve" })
        return "customer@example.com"
      },
    })

    expect(result).toEqual({ channel: "email", sent: true })
    expect(calls.map((call) => call.name)).toEqual([
      "claim",
      "resolve",
      "email",
      "complete",
    ])
    expect(JSON.stringify(calls[2]?.input)).toMatch(/\d{6}/)
    expect(JSON.stringify(payload)).not.toContain("customer@example.com")
  })

  test("fails WhatsApp verification closed pending the policy-enabled bridge", async () => {
    const failures: unknown[] = []
    const result = await runStoreConversationNotificationVerification(payload, {
      claim: async () => ({
        channel: "whatsapp",
        destinationCiphertext: "protected-recipient",
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
        sendAttemptCount: 1,
        verificationId: payload.verificationId,
      }),
      complete: async () => undefined,
      emailTransport: {
        send: async () => {
          throw new Error("must not send")
        },
      },
      fail: async (input) => {
        failures.push(input)
      },
      resolveRecipient: () => {
        throw new Error("must not decrypt")
      },
    })

    expect(result).toBeNull()
    expect(failures).toEqual([
      {
        ...payload,
        failureCode: "whatsapp_verification_policy_unavailable",
        terminal: true,
      },
    ])
  })
})
