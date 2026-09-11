import { describe, expect, test } from "bun:test"

import { runStoreConversationNotificationDispatch } from "./store-conversation-notification-dispatch"

const payload = {
  intentId: "intent-1",
  storeId: "store-1",
  tenantId: "tenant-1",
}

function dependencies(input?: {
  claim?: null | {
    accountEmail: string | null
    attemptId: string
    attemptNumber: number
    channel: "email" | "push" | "whatsapp"
    destinationCiphertext: string | null
    endpointKind: "native_expo" | "web_push" | null
    intentId: string
    kind: "store_reopened" | "unread_response"
    storeName: string
  }
  sendNativePush?: () => Promise<{
    invalidDestination?: boolean
    providerKey: string
    providerOperationReference?: string
  }>
}) {
  const calls: Array<{ input: unknown; name: string }> = []
  return {
    calls,
    value: {
      assertProviderAllowed: async () => undefined,
      claim: async (claimInput: unknown) => {
        calls.push({ input: claimInput, name: "claim" })
        return input?.claim === undefined
          ? {
              accountEmail: null,
              attemptId: "attempt-1",
              attemptNumber: 1,
              channel: "push" as const,
              destinationCiphertext: "protected-endpoint",
              endpointKind: "native_expo" as const,
              intentId: payload.intentId,
              kind: "unread_response" as const,
              storeName: "Amina Pharmacy",
            }
          : input.claim
      },
      complete: async (completeInput: unknown) => {
        calls.push({ input: completeInput, name: "complete" })
      },
      emailTransport: {
        send: async (message: unknown) => {
          calls.push({ input: message, name: "email" })
          return { provider: "email-test", providerMessageId: "email-1" }
        },
      },
      fail: async (failInput: unknown) => {
        calls.push({ input: failInput, name: "fail" })
        return null
      },
      invalidatePush: async (invalidateInput: unknown) => {
        calls.push({ input: invalidateInput, name: "invalidate" })
      },
      resolveEndpoint: (reference: string) => {
        calls.push({ input: reference, name: "resolveEndpoint" })
        return JSON.stringify({
          expoPushToken: "ExponentPushToken[test-token]",
          kind: "native_expo",
        })
      },
      resolveRecipient: (reference: string) => {
        calls.push({ input: reference, name: "resolveRecipient" })
        return "customer@example.com"
      },
      sendNativePush: async (pushInput: unknown) => {
        calls.push({ input: pushInput, name: "push" })
        return input?.sendNativePush
          ? input.sendNativePush()
          : {
              providerKey: "expo-push",
              providerOperationReference: "operation-1",
            }
      },
      sendWebPush: async () => {
        throw new Error("not used")
      },
    },
  }
}

describe("Store Conversation notification dispatch", () => {
  test("does not invoke push when current QA policy blocks the job", async () => {
    const setup = dependencies()
    setup.value.assertProviderAllowed = async () => {
      throw Object.assign(new Error("QA provider blocked"), {
        code: "QA_LIVE_EFFECT_BLOCKED",
      })
    }
    await expect(
      runStoreConversationNotificationDispatch(payload, setup.value),
    ).resolves.toBeNull()
    expect(setup.calls.map((call) => call.name)).toEqual(["claim", "fail"])
  })

  test("decrypts only after claim and sends neutral Expo push content", async () => {
    const setup = dependencies()
    const result = await runStoreConversationNotificationDispatch(
      payload,
      setup.value,
    )

    expect(result).toEqual({ channel: "push", sent: true })
    expect(setup.calls.map((call) => call.name)).toEqual([
      "claim",
      "resolveEndpoint",
      "push",
      "complete",
    ])
    expect(setup.calls[2]?.input).toEqual({
      body: "You have a new response from Amina Pharmacy.",
      idempotencyKey: "intent-1",
      title: "New Store response",
      token: "ExponentPushToken[test-token]",
    })
    expect(JSON.stringify(setup.calls[2]?.input)).not.toContain("prescription")
    expect(JSON.stringify(payload)).not.toContain("customer@example.com")
  })

  test("does not decrypt or send when the repository cancels before claim", async () => {
    const setup = dependencies({ claim: null })
    await expect(
      runStoreConversationNotificationDispatch(payload, setup.value),
    ).resolves.toBeNull()
    expect(setup.calls).toEqual([{ input: payload, name: "claim" }])
  })

  test("invalidates a rejected Expo destination and records bounded failure", async () => {
    const setup = dependencies({
      sendNativePush: async () => ({
        invalidDestination: true,
        providerKey: "expo-push",
      }),
    })
    await expect(
      runStoreConversationNotificationDispatch(payload, setup.value),
    ).resolves.toBeNull()
    expect(setup.calls.map((call) => call.name)).toContain("fail")
  })
})
