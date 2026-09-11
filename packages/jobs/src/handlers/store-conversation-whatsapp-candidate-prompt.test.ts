import { describe, expect, test } from "bun:test"

import type { WhatsAppProvider } from "@ewatrade/communications"

import { runStoreConversationWhatsAppCandidatePrompt } from "./store-conversation-whatsapp-candidate-prompt"

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
  candidateId: "candidate_1",
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("Store Conversation WhatsApp candidate prompt", () => {
  test("sends the neutral three-action prompt without conversation content", async () => {
    const writes: unknown[] = []
    const result = await runStoreConversationWhatsAppCandidatePrompt(payload, {
      assertProviderAllowed: async () => undefined,
      claim: async ({ claimToken }) => ({
        actions: ["continue", "start_new", "not_mine"],
        attemptId: "attempt_1",
        candidateId: "candidate_1",
        candidateRevision: 1,
        claimToken,
        credentialReference: "credential_ciphertext",
        externalCustomerId: "2348000000000",
        phoneNumberId: "phone_1",
      }),
      complete: async (input) => writes.push(input),
      deriveActionToken: ({ action }) => `token:${action}`,
      digestProviderReference: () => "d".repeat(64),
      fail: async (input) => writes.push(input),
      issueClaimToken: () => "claim_1",
      provider: provider(async (input) => {
        expect(input.body).toBe(
          "A recent EwaTrade conversation may be available for this Store. Choose how to continue.",
        )
        expect(input.buttons).toEqual([
          { id: "token:continue", title: "Continue that conversation" },
          { id: "token:start_new", title: "Start a new request" },
          { id: "token:not_mine", title: "That isn't mine" },
        ])
        expect(JSON.stringify(input)).not.toContain("prescription")
        return { messageId: "private_provider_message" }
      }),
      resolveCredential: () => "private_access_token",
    })

    expect(result).toEqual({ sent: true })
    expect(JSON.stringify(writes)).not.toContain("private_provider_message")
  })

  test("does nothing when the candidate is no longer current", async () => {
    let providerCalled = false
    const result = await runStoreConversationWhatsAppCandidatePrompt(payload, {
      assertProviderAllowed: async () => undefined,
      claim: async () => null,
      complete: async () => undefined,
      deriveActionToken: () => "unused",
      digestProviderReference: () => "d".repeat(64),
      fail: async () => undefined,
      issueClaimToken: () => "claim_1",
      provider: provider(async () => {
        providerCalled = true
        return { messageId: "unused" }
      }),
      resolveCredential: () => "private_access_token",
    })

    expect(result).toBeNull()
    expect(providerCalled).toBe(false)
  })
})
