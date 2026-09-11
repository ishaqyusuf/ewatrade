import { describe, expect, test } from "bun:test"

import {
  type WhatsAppProvider,
  WhatsAppProviderSendError,
} from "@ewatrade/communications"

import { runStoreConversationWhatsAppBridgePrompt } from "./store-conversation-whatsapp-bridge-prompt"

function provider(
  sendButtons: WhatsAppProvider["sendButtons"],
): WhatsAppProvider {
  return {
    discover: async () => [],
    exchangeEmbeddedSignupCode: async () => ({ accessToken: "" }),
    fetchMedia: async () => ({ bytes: new Uint8Array(), mediaType: "" }),
    key: "fake",
    sendButtons,
    sendTemplate: async () => ({ messageId: "" }),
    sendText: async () => ({ messageId: "" }),
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
  bridgeId: "bridge_1",
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("Store Conversation WhatsApp bridge prompt", () => {
  test("sends only deterministic current choices and records the digested receipt", async () => {
    const writes: unknown[] = []
    const result = await runStoreConversationWhatsAppBridgePrompt(payload, {
      assertProviderAllowed: async () => undefined,
      claim: async ({ claimToken }) => ({
        attemptId: "attempt_1",
        bridgeId: "bridge_1",
        bridgeRevision: 2,
        choices: ["continue_current_request", "start_new_request"],
        claimToken,
        credentialReference: "credential_ciphertext",
        externalCustomerIdCiphertext: "recipient_ciphertext",
        phoneNumberId: "phone_number_1",
        promptKind: "bridge_choice",
      }),
      complete: async (input) => writes.push(input),
      deriveChoiceToken: ({ choice }) => `token:${choice}`,
      digestProviderReference: () => "d".repeat(64),
      fail: async (input) => writes.push(input),
      issueClaimToken: () => "claim_1",
      provider: provider(async (input) => {
        expect(input.to).toBe("2348000000000")
        expect(input.buttons).toEqual([
          {
            id: "token:continue_current_request",
            title: "Continue where I stopped",
          },
          { id: "token:start_new_request", title: "Start a new request" },
        ])
        return { messageId: "provider_message_private" }
      }),
      resolveCredential: () => "access-token-private",
      resolveRecipient: () => "2348000000000",
    })

    expect(result).toEqual({ sent: true })
    expect(writes).toEqual([
      {
        ...payload,
        attemptId: "attempt_1",
        claimToken: "claim_1",
        providerReferenceDigest: "d".repeat(64),
      },
    ])
    expect(JSON.stringify(writes)).not.toContain("provider_message_private")
  })

  test("records an ambiguous outcome without automatic resend authority", async () => {
    const failures: unknown[] = []
    await expect(
      runStoreConversationWhatsAppBridgePrompt(payload, {
        assertProviderAllowed: async () => undefined,
        claim: async ({ claimToken }) => ({
          attemptId: "attempt_1",
          bridgeId: "bridge_1",
          bridgeRevision: 1,
          choices: ["start_new_request"],
          claimToken,
          credentialReference: "credential_ciphertext",
          externalCustomerIdCiphertext: "recipient_ciphertext",
          phoneNumberId: "phone_number_1",
          promptKind: "bridge_choice",
        }),
        complete: async () => undefined,
        deriveChoiceToken: () => "choice_token",
        digestProviderReference: () => "d".repeat(64),
        fail: async (input) => failures.push(input),
        issueClaimToken: () => "claim_1",
        provider: provider(async () => {
          throw new Error("private provider response")
        }),
        resolveCredential: () => "access-token-private",
        resolveRecipient: () => "2348000000000",
      }),
    ).rejects.toThrow("outcome is unknown")

    expect(failures).toEqual([
      {
        ...payload,
        attemptId: "attempt_1",
        claimToken: "claim_1",
        failureCode: "provider_outcome_unknown",
        outcomeUnknown: true,
      },
    ])
  })

  test("releases an explicit provider rejection for bounded recovery", async () => {
    const failures: unknown[] = []
    await expect(
      runStoreConversationWhatsAppBridgePrompt(payload, {
        assertProviderAllowed: async () => undefined,
        claim: async ({ claimToken }) => ({
          attemptId: "attempt_1",
          bridgeId: "bridge_1",
          bridgeRevision: 1,
          choices: ["start_new_request"],
          claimToken,
          credentialReference: "credential_ciphertext",
          externalCustomerIdCiphertext: "recipient_ciphertext",
          phoneNumberId: "phone_number_1",
          promptKind: "bridge_choice",
        }),
        complete: async () => undefined,
        deriveChoiceToken: () => "choice_token",
        digestProviderReference: () => "d".repeat(64),
        fail: async (input) => failures.push(input),
        issueClaimToken: () => "claim_1",
        provider: provider(async () => {
          throw new WhatsAppProviderSendError(
            "PROVIDER_REJECTED",
            "DEFINITE_FAILURE",
          )
        }),
        resolveCredential: () => "access-token-private",
        resolveRecipient: () => "2348000000000",
      }),
    ).rejects.toThrow("was rejected")

    expect(failures).toEqual([
      {
        ...payload,
        attemptId: "attempt_1",
        claimToken: "claim_1",
        failureCode: "provider_rejected",
        outcomeUnknown: false,
      },
    ])
  })

  test("sends the explicit typed intake choice after Start a new request", async () => {
    const result = await runStoreConversationWhatsAppBridgePrompt(payload, {
      assertProviderAllowed: async () => undefined,
      claim: async ({ claimToken }) => ({
        attemptId: "attempt_2",
        bridgeId: "bridge_1",
        bridgeRevision: 3,
        choices: ["commerce_inquiry"],
        claimToken,
        credentialReference: "credential_ciphertext",
        externalCustomerIdCiphertext: "recipient_ciphertext",
        phoneNumberId: "phone_number_1",
        promptKind: "request_kind",
      }),
      complete: async () => undefined,
      deriveChoiceToken: () => {
        throw new Error("Bridge-choice tokens are not used for Request kinds.")
      },
      digestProviderReference: () => "d".repeat(64),
      fail: async () => undefined,
      issueClaimToken: () => "claim_2",
      provider: provider(async (input) => {
        expect(input.body).toBe("Choose the type of request you want to start.")
        expect(input.buttons).toEqual([
          { id: "intent:product", title: "Product request" },
        ])
        return { messageId: "provider_message_private" }
      }),
      resolveCredential: () => "access-token-private",
      resolveRecipient: () => "2348000000000",
    })

    expect(result).toEqual({ sent: true })
  })
})
