import { describe, expect, test } from "bun:test"

import {
  InMemoryConversationStateStore,
  type WhatsAppProvider,
  prescriptionConversationContextId,
} from "@ewatrade/communications"

import { runPrescriptionCommunicationDispatch } from "./prescription-communication-dispatch"

function createProvider(
  sendButtons: WhatsAppProvider["sendButtons"],
): WhatsAppProvider {
  return {
    key: "fake",
    discover: async () => [],
    exchangeEmbeddedSignupCode: async () => ({ accessToken: "token" }),
    fetchMedia: async () => ({
      bytes: new Uint8Array(),
      mediaType: "image/jpeg",
    }),
    sendButtons,
    sendTemplate: async () => ({ messageId: "unused" }),
    sendText: async () => ({ messageId: "unused" }),
    testConnection: async () => ({
      businessVerified: true,
      displayNumber: "+2348000000000",
      numberVerified: true,
      outboundVerified: true,
      webhookSubscribed: true,
      templatesReady: true,
      templateConfiguration: {},
    }),
  }
}

describe("prescription communication dispatch", () => {
  test("uses connection-scoped sender credentials and neutral in-session buttons", async () => {
    const sent: unknown[] = []
    const state = new InMemoryConversationStateStore()
    await state.set({
      connectionId: "connection-1",
      contextId: prescriptionConversationContextId("store-1"),
      externalCustomerId: "2348000000000",
      state: {
        contextId: prescriptionConversationContextId("store-1"),
        lastSeenAt: new Date().toISOString(),
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    })
    const provider = createProvider(async (input) => {
      sent.push(input)
      return { messageId: "message-1" }
    })
    await runPrescriptionCommunicationDispatch(
      { intentId: "intent-1" },
      {
        claim: async () => ({
          attemptId: "attempt-1",
          connectionId: "connection-1",
          credentialReference: "credential-1",
          intentId: "intent-1",
          payload: {
            actions: [{ protectedId: "encrypted-action", title: "Pick up" }],
          },
          phoneNumberId: "phone-1",
          recipientReference: "2348000000000",
          storeId: "store-1",
          templateConfiguration: {},
          type: "quote_ready",
        }),
        complete: async () => undefined,
        provider,
        resolveActionId: () => "rx:opaque",
        resolveCredential: () => "access-token-1",
        state,
      },
    )
    expect(sent[0]).toMatchObject({
      accessToken: "access-token-1",
      phoneNumberId: "phone-1",
      to: "2348000000000",
    })
    expect(JSON.stringify(sent[0])).not.toMatch(
      /medicine|prescription contents/i,
    )
  })

  test("keeps one customer's pharmacy senders isolated by connection and Store", async () => {
    const sent: unknown[] = []
    const state = new InMemoryConversationStateStore()
    const recipientReference = "2348000000000"
    const claims = {
      "intent-1": {
        connectionId: "connection-1",
        credentialReference: "credential-1",
        phoneNumberId: "phone-1",
        storeId: "store-1",
      },
      "intent-2": {
        connectionId: "connection-2",
        credentialReference: "credential-2",
        phoneNumberId: "phone-2",
        storeId: "store-2",
      },
    } as const
    for (const claim of Object.values(claims)) {
      const contextId = prescriptionConversationContextId(claim.storeId)
      await state.set({
        connectionId: claim.connectionId,
        contextId,
        externalCustomerId: recipientReference,
        state: {
          contextId,
          lastSeenAt: new Date().toISOString(),
          storeId: claim.storeId,
          tenantId: `tenant-${claim.storeId.slice(-1)}`,
        },
      })
    }
    const provider = createProvider(async (input) => {
      sent.push(input)
      return { messageId: `message-${sent.length}` }
    })

    for (const intentId of ["intent-1", "intent-2"] as const) {
      const claim = claims[intentId]
      await runPrescriptionCommunicationDispatch(
        { intentId },
        {
          claim: async () => ({
            attemptId: `attempt-${intentId.slice(-1)}`,
            ...claim,
            intentId,
            payload: {
              actions: [{ protectedId: "encrypted-action", title: "Pick up" }],
            },
            recipientReference,
            templateConfiguration: {},
            type: "quote_ready",
          }),
          complete: async () => undefined,
          provider,
          resolveActionId: () => "rx:opaque",
          resolveCredential: (reference) =>
            `access-token-${reference.slice(-1)}`,
          state,
        },
      )
    }

    expect(sent).toEqual([
      expect.objectContaining({
        accessToken: "access-token-1",
        phoneNumberId: "phone-1",
        to: recipientReference,
      }),
      expect.objectContaining({
        accessToken: "access-token-2",
        phoneNumberId: "phone-2",
        to: recipientReference,
      }),
    ])
  })

  test("records a retryable notification failure when Meta delivery fails", async () => {
    const completions: unknown[] = []
    const state = new InMemoryConversationStateStore()
    await state.set({
      connectionId: "connection-1",
      contextId: prescriptionConversationContextId("store-1"),
      externalCustomerId: "2348000000000",
      state: {
        contextId: prescriptionConversationContextId("store-1"),
        lastSeenAt: new Date().toISOString(),
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    })

    await expect(
      runPrescriptionCommunicationDispatch(
        { intentId: "intent-1" },
        {
          claim: async () => ({
            attemptId: "attempt-1",
            connectionId: "connection-1",
            credentialReference: "credential-1",
            intentId: "intent-1",
            payload: {
              actions: [{ protectedId: "encrypted-action", title: "Pick up" }],
            },
            phoneNumberId: "phone-1",
            recipientReference: "2348000000000",
            storeId: "store-1",
            templateConfiguration: {},
            type: "quote_ready",
          }),
          complete: async (input) => completions.push(input),
          provider: createProvider(async () => {
            throw new Error("temporary Meta send failure")
          }),
          resolveActionId: () => "rx:opaque",
          resolveCredential: () => "access-token-1",
          state,
        },
      ),
    ).rejects.toThrow("temporary Meta send failure")
    expect(completions).toEqual([
      {
        attemptId: "attempt-1",
        failureCode: "provider_delivery_failed",
        intentId: "intent-1",
      },
    ])
  })
})
