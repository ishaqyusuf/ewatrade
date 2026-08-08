import { describe, expect, test } from "bun:test"

import {
  InMemoryConversationStateStore,
  type WhatsAppProvider,
  prescriptionConversationContextId,
} from "@ewatrade/communications"

import { runPrescriptionCommunicationDispatch } from "./prescription-communication-dispatch"

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
    const provider = {
      key: "fake",
      discover: async () => [],
      exchangeEmbeddedSignupCode: async () => ({ accessToken: "token" }),
      fetchMedia: async () => ({
        bytes: new Uint8Array(),
        mediaType: "image/jpeg",
      }),
      sendButtons: async (input) => {
        sent.push(input)
        return { messageId: "message-1" }
      },
      sendTemplate: async () => ({ messageId: "message-1" }),
      sendText: async () => ({ messageId: "message-1" }),
      testConnection: async () => ({
        businessVerified: true,
        displayNumber: "+2348000000000",
        numberVerified: true,
        outboundVerified: true,
        webhookSubscribed: true,
        templatesReady: true,
        templateConfiguration: {},
      }),
    } satisfies WhatsAppProvider
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
})
