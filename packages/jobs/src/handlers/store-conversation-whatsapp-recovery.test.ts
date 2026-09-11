import { describe, expect, test } from "bun:test"

import {
  type WhatsAppProvider,
  WhatsAppProviderSendError,
} from "@ewatrade/communications"

import { runStoreConversationWhatsAppRecovery } from "./store-conversation-whatsapp-recovery"

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

function dependencies(
  overrides: Partial<
    Parameters<typeof runStoreConversationWhatsAppRecovery>[1]
  > = {},
) {
  return {
    assertProviderAllowed: async () => undefined,
    claim: async ({ claimToken }: { claimToken: string }) => ({
      attemptId: "attempt_1",
      claimToken,
      credentialReference: "credential_ciphertext",
      externalCustomerId: "2348000000000",
      phoneNumberId: "phone_1",
      publicToken: "entry_private",
    }),
    complete: async () => undefined,
    digestProviderReference: () => "d".repeat(64),
    fail: async () => undefined,
    issueClaimToken: () => "claim_1",
    provider: provider(async () => ({ messageId: "provider_private" })),
    resolveCredential: () => "private_access_token",
    storefrontOrigin: "https://chat.ewatrade.com",
    ...overrides,
  }
}

describe("Store Conversation WhatsApp recovery", () => {
  test("sends only the current neutral Store Entry recovery URL", async () => {
    const writes: unknown[] = []
    const result = await runStoreConversationWhatsAppRecovery(
      payload,
      dependencies({
        complete: async (input) => writes.push(input),
        provider: provider(async (input) => {
          expect(input.body).toBe(
            "We couldn't safely match this message to one conversation. Continue securely on EwaTrade: https://chat.ewatrade.com/r/entry_private",
          )
          expect(JSON.stringify(input)).not.toMatch(
            /prescription|quote|amount|conversation_\d|request_\d/i,
          )
          return { messageId: "provider_private" }
        }),
      }),
    )

    expect(result).toEqual({ sent: true })
    expect(writes).toEqual([
      {
        ...payload,
        claimToken: "claim_1",
        providerReferenceDigest: "d".repeat(64),
      },
    ])
    expect(JSON.stringify(writes)).not.toContain("provider_private")
  })

  test("does not retry an ambiguous provider outcome", async () => {
    const failures: unknown[] = []
    await expect(
      runStoreConversationWhatsAppRecovery(
        payload,
        dependencies({
          fail: async (input) => failures.push(input),
          provider: provider(async () => {
            throw new WhatsAppProviderSendError(
              "PROVIDER_RESULT_INVALID",
              "OUTCOME_UNKNOWN",
            )
          }),
        }),
      ),
    ).rejects.toThrow("outcome is unknown")

    expect(failures).toEqual([
      {
        ...payload,
        claimToken: "claim_1",
        failureCode: "provider_outcome_unknown",
        outcomeUnknown: true,
      },
    ])
  })

  test("releases an explicit provider rejection for bounded recovery", async () => {
    const failures: unknown[] = []
    await expect(
      runStoreConversationWhatsAppRecovery(
        payload,
        dependencies({
          fail: async (input) => failures.push(input),
          provider: provider(async () => {
            throw new WhatsAppProviderSendError(
              "PROVIDER_REJECTED",
              "DEFINITE_FAILURE",
            )
          }),
        }),
      ),
    ).rejects.toThrow("was rejected")

    expect(failures).toEqual([
      {
        ...payload,
        claimToken: "claim_1",
        failureCode: "provider_rejected",
        outcomeUnknown: false,
      },
    ])
  })
})
