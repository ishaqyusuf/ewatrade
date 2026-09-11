import { describe, expect, test } from "bun:test"

import {
  type WhatsAppProvider,
  WhatsAppProviderSendError,
} from "@ewatrade/communications"

import { runStoreConversationWhatsAppOutbound } from "./store-conversation-whatsapp-outbound"

function provider(sendText: WhatsAppProvider["sendText"]): WhatsAppProvider {
  return {
    discover: async () => [],
    exchangeEmbeddedSignupCode: async () => ({ accessToken: "" }),
    fetchMedia: async () => ({ bytes: new Uint8Array(), mediaType: "" }),
    key: "fake",
    sendButtons: async () => ({ messageId: "" }),
    sendTemplate: async () => ({ messageId: "" }),
    sendText,
    testConnection: async () => ({
      businessVerified: true,
      displayNumber: "",
      numberVerified: true,
      outboundVerified: true,
      templateConfiguration: {},
      templatesReady: true,
      webhookSubscribed: true,
    }),
  }
}

const payload = {
  attemptId: "attempt_1",
  storeId: "store_1",
  tenantId: "tenant_1",
}

function claim() {
  return {
    attemptId: "attempt_1",
    connectionId: "connection_1",
    credentialReference: "credential_ciphertext",
    phoneNumberId: "phone_1",
    recipientCiphertext: "recipient_ciphertext",
    text: "Your quotation is ready.",
  }
}

describe("Store Conversation WhatsApp outbound reply", () => {
  test("does not call Meta when the current Tenant provider policy blocks QA", async () => {
    let providerCalls = 0
    await expect(
      runStoreConversationWhatsAppOutbound(payload, {
        assertProviderAllowed: async () => {
          throw Object.assign(new Error("QA provider blocked"), {
            code: "QA_LIVE_EFFECT_BLOCKED",
          })
        },
        claim: async () => claim(),
        complete: async () => undefined,
        digest: () => "d".repeat(64),
        fail: async () => undefined,
        issueClaimToken: () => "claim_1",
        provider: provider(async () => {
          providerCalls += 1
          return { messageId: "must-not-send" }
        }),
        resolveCredential: () => "must-not-decrypt",
        resolveRecipient: () => "must-not-decrypt",
      }),
    ).rejects.toMatchObject({ code: "QA_LIVE_EFFECT_BLOCKED" })
    expect(providerCalls).toBe(0)
  })

  test("sends one claimed staff message and persists only digested provider evidence", async () => {
    const writes: unknown[] = []
    const result = await runStoreConversationWhatsAppOutbound(payload, {
      assertProviderAllowed: async () => undefined,
      claim: async () => claim(),
      complete: async (input) => writes.push(input),
      digest: (value) =>
        (value.startsWith("outbound-event:") ? "e" : "p").repeat(64),
      fail: async (input) => writes.push(input),
      issueClaimToken: () => "claim_1",
      provider: provider(async (input) => {
        expect(input).toEqual({
          accessToken: "private_access_token",
          body: "Your quotation is ready.",
          phoneNumberId: "phone_1",
          to: "2348000000000",
        })
        return { messageId: "private_provider_message" }
      }),
      resolveCredential: () => "private_access_token",
      resolveRecipient: () => "2348000000000",
    })

    expect(result).toEqual({ sent: true })
    expect(writes).toEqual([
      {
        attemptId: "attempt_1",
        claimToken: "claim_1",
        eventDigest: "e".repeat(64),
        providerReferenceDigest: "p".repeat(64),
      },
    ])
    expect(JSON.stringify(writes)).not.toContain("private_provider_message")
  })

  test("keeps ambiguous provider outcomes unavailable for automatic retry", async () => {
    const failures: unknown[] = []
    await expect(
      runStoreConversationWhatsAppOutbound(payload, {
        assertProviderAllowed: async () => undefined,
        claim: async () => claim(),
        complete: async () => undefined,
        digest: () => "d".repeat(64),
        fail: async (input) => failures.push(input),
        issueClaimToken: () => "claim_1",
        provider: provider(async () => {
          throw new Error("private provider response")
        }),
        resolveCredential: () => "private_access_token",
        resolveRecipient: () => "2348000000000",
      }),
    ).rejects.toThrow("outcome is unknown")

    expect(failures).toEqual([
      {
        attemptId: "attempt_1",
        claimToken: "claim_1",
        failureCode: "provider_outcome_unknown",
        outcomeUnknown: true,
      },
    ])
  })

  test("releases only an explicit provider rejection for bounded recovery", async () => {
    const failures: unknown[] = []
    await expect(
      runStoreConversationWhatsAppOutbound(payload, {
        assertProviderAllowed: async () => undefined,
        claim: async () => claim(),
        complete: async () => undefined,
        digest: () => "d".repeat(64),
        fail: async (input) => failures.push(input),
        issueClaimToken: () => "claim_1",
        provider: provider(async () => {
          throw new WhatsAppProviderSendError(
            "PROVIDER_REJECTED",
            "DEFINITE_FAILURE",
          )
        }),
        resolveCredential: () => "private_access_token",
        resolveRecipient: () => "2348000000000",
      }),
    ).rejects.toThrow("was rejected")

    expect(failures[0]).toMatchObject({ outcomeUnknown: false })
  })
})
