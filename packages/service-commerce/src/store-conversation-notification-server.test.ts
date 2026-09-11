import { afterEach, describe, expect, test } from "bun:test"

import {
  deriveStoreConversationNotificationVerificationCode,
  digestStoreConversationNotificationDestination,
  digestStoreConversationNotificationVerificationCode,
  parseStoreConversationPushEndpoint,
  prepareStoreConversationNotificationVerification,
  serializeStoreConversationPushEndpoint,
} from "./store-conversation-notification-server"

const originalSecret =
  process.env.STORE_CONVERSATION_NOTIFICATION_VERIFICATION_SECRET

afterEach(() => {
  process.env.STORE_CONVERSATION_NOTIFICATION_VERIFICATION_SECRET =
    originalSecret
})

describe("Store Conversation notification server secrets", () => {
  test("derives a stable six-digit code while storing only its digest", () => {
    process.env.STORE_CONVERSATION_NOTIFICATION_VERIFICATION_SECRET =
      "a-secure-test-secret-that-is-at-least-thirty-two-bytes"
    const code =
      deriveStoreConversationNotificationVerificationCode("verification_1")
    const digest = digestStoreConversationNotificationVerificationCode({
      code,
      verificationId: "verification_1",
    })
    expect(code).toMatch(/^\d{6}$/)
    expect(digest).toHaveLength(64)
    expect(digest).not.toContain(code)
  })

  test("normalizes contact destination before keyed digest", () => {
    process.env.STORE_CONVERSATION_NOTIFICATION_VERIFICATION_SECRET =
      "a-secure-test-secret-that-is-at-least-thirty-two-bytes"
    expect(
      digestStoreConversationNotificationDestination({
        channel: "email",
        destination: " Customer@Example.com ",
      }),
    ).toBe(
      digestStoreConversationNotificationDestination({
        channel: "email",
        destination: "customer@example.com",
      }),
    )
  })

  test("prepares one protected digest-only verification envelope", () => {
    process.env.STORE_CONVERSATION_NOTIFICATION_VERIFICATION_SECRET =
      "a-secure-test-secret-that-is-at-least-thirty-two-bytes"
    const prepared = prepareStoreConversationNotificationVerification(
      { channel: "email", destination: "  Customer@Example.COM " },
      { protectDestination: (value) => `protected:${value}` },
    )

    expect(prepared.destinationCiphertext).toBe(
      "protected:customer@example.com",
    )
    expect(prepared.maskedDestination).toBe("cu•••@example.com")
    expect(prepared.destinationDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(prepared.tokenDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(prepared)).not.toContain("Customer@Example.COM")
  })

  test("serializes and parses only allowlisted push endpoint fields", () => {
    const serialized = serializeStoreConversationPushEndpoint({
      expoPushToken: "ExponentPushToken[test-device]",
      kind: "native_expo",
    })
    expect(parseStoreConversationPushEndpoint(serialized)).toEqual({
      expoPushToken: "ExponentPushToken[test-device]",
      kind: "native_expo",
    })
  })
})
