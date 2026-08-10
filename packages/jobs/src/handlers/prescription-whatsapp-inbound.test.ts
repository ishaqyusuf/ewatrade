import { describe, expect, test } from "bun:test"

import {
  InMemoryConversationStateStore,
  type WhatsAppProvider,
  prescriptionConversationContextId,
  protectCommunicationsCredential,
} from "@ewatrade/communications"

import { runPrescriptionWhatsAppInbound } from "./prescription-whatsapp-inbound"

const provider: WhatsAppProvider = {
  key: "fake",
  discover: async () => [],
  exchangeEmbeddedSignupCode: async () => ({ accessToken: "token" }),
  fetchMedia: async () => ({
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: "image/jpeg",
  }),
  sendButtons: async () => ({ messageId: "message" }),
  sendTemplate: async () => ({ messageId: "message" }),
  sendText: async () => ({ messageId: "message" }),
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

describe("WhatsApp prescription intake job", () => {
  test("uses an identifier-only payload and preserves connection/store scope", async () => {
    const submissions: unknown[] = []
    const result = await runPrescriptionWhatsAppInbound(
      { inboundEventId: "inbound-1" },
      {
        claim: async () => ({
          connectionId: "connection-1",
          credentialReference: "unused-for-text",
          externalCustomerId: "2348000000000",
          inboundEventId: "inbound-1",
          messageType: "text",
          normalizedPayload: { text: "Customer-provided prescription text" },
          phoneNumberId: "phone-1",
          providerEventId: "message-1",
          requestId: null,
          routeVertical: "pharmacy" as const,
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
        complete: async () => undefined,
        continueRequest: async () => null,
        consumeQuickAction: async () => undefined,
        createIntent: async () => ({ id: "intent-1" }),
        enqueueDispatch: async () => undefined,
        enqueueSafety: async () => undefined,
        provider,
        state: new InMemoryConversationStateStore(),
        submit: async (input) => {
          submissions.push(input)
          return { created: true, reference: "RX-1", requestId: "request-1" }
        },
      },
    )
    expect(result).toMatchObject({ requestId: "request-1" })
    expect(submissions[0]).toMatchObject({
      storeId: "store-1",
      tenantId: "tenant-1",
    })
  })

  test("continues the connection-scoped request stored by the conversation runtime", async () => {
    const continued: unknown[] = []
    const submitted: unknown[] = []
    const state = new InMemoryConversationStateStore()
    const result = await runPrescriptionWhatsAppInbound(
      { inboundEventId: "inbound-2" },
      {
        claim: async () => ({
          connectionId: "connection-1",
          credentialReference: "unused-for-text",
          externalCustomerId: "2348000000000",
          inboundEventId: "inbound-2",
          messageType: "text",
          normalizedPayload: { text: "A clearer follow-up" },
          phoneNumberId: "phone-1",
          providerEventId: "message-2",
          requestId: "request-1",
          routeVertical: "pharmacy" as const,
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
        complete: async () => undefined,
        continueRequest: async (input) => {
          continued.push(input)
          return { created: false, reference: "RX-1", requestId: "request-1" }
        },
        consumeQuickAction: async () => undefined,
        createIntent: async () => ({ id: "intent-1" }),
        enqueueDispatch: async () => undefined,
        enqueueSafety: async () => undefined,
        provider,
        state,
        submit: async (input) => {
          submitted.push(input)
          return { created: true, reference: "RX-2", requestId: "request-2" }
        },
      },
    )

    expect(result).toMatchObject({ created: false, requestId: "request-1" })
    expect(continued).toHaveLength(1)
    expect(submitted).toHaveLength(0)
    expect(
      await state.get({
        connectionId: "connection-1",
        contextId: prescriptionConversationContextId("store-1"),
        externalCustomerId: "2348000000000",
      }),
    ).toMatchObject({ requestId: "request-1", storeId: "store-1" })
  })

  test("marks a provider failure and rethrows so the durable job can retry", async () => {
    const completions: unknown[] = []
    const failingProvider: WhatsAppProvider = {
      ...provider,
      fetchMedia: async () => {
        throw new Error("temporary Meta media failure")
      },
    }

    await expect(
      runPrescriptionWhatsAppInbound(
        { inboundEventId: "inbound-3" },
        {
          claim: async () => ({
            connectionId: "connection-1",
            credentialReference:
              protectCommunicationsCredential("credential-1"),
            externalCustomerId: "2348000000000",
            inboundEventId: "inbound-3",
            messageType: "media",
            normalizedPayload: { mediaId: "media-1" },
            phoneNumberId: "phone-1",
            providerEventId: "message-3",
            requestId: null,
            routeVertical: "pharmacy" as const,
            storeId: "store-1",
            tenantId: "tenant-1",
          }),
          complete: async (input) => completions.push(input),
          continueRequest: async () => null,
          consumeQuickAction: async () => undefined,
          createIntent: async () => ({ id: "intent-1" }),
          enqueueDispatch: async () => undefined,
          enqueueSafety: async () => undefined,
          provider: failingProvider,
          state: new InMemoryConversationStateStore(),
          submit: async () => ({
            created: true,
            reference: "RX-3",
            requestId: "request-3",
          }),
        },
      ),
    ).rejects.toThrow("temporary Meta media failure")
    expect(completions).toEqual([
      { failureCode: "processing_failed", inboundEventId: "inbound-3" },
    ])
  })

  test("turns a digested quick-action token into a secure Quote URL without exposing the durable entity id", async () => {
    const intents: Array<{ payload: unknown }> = []

    const result = await runPrescriptionWhatsAppInbound(
      { inboundEventId: "inbound-4" },
      {
        claim: async () => ({
          connectionId: "connection-1",
          credentialReference: "unused-for-action",
          externalCustomerId: "2348000000000",
          inboundEventId: "inbound-4",
          messageType: "interactive",
          normalizedPayload: { quickActionId: "rx:public-capability" },
          phoneNumberId: "phone-1",
          providerEventId: "message-4",
          requestId: null,
          routeVertical: "pharmacy" as const,
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
        complete: async () => undefined,
        continueRequest: async () => null,
        consumeQuickAction: async () => ({
          action: "pickup",
          entityId: "quote-version-secret-internal-id",
          entityType: "quote_version",
          publicAccessToken: "public-capability",
        }),
        createIntent: async (input) => {
          intents.push(input)
          return { id: "intent-1" }
        },
        enqueueDispatch: async () => undefined,
        enqueueSafety: async () => undefined,
        provider,
        state: new InMemoryConversationStateStore(),
        submit: async () => ({
          created: true,
          reference: "RX-4",
          requestId: "request-4",
        }),
      },
    )

    expect(intents[0]?.payload).toEqual({
      secureUrl:
        "https://ewatrade-storefront.localhost/prescription-quote/public-capability",
    })
    expect(JSON.stringify(intents[0]?.payload)).not.toContain(
      "quote-version-secret-internal-id",
    )
    expect(result).toMatchObject({ entityType: "quote_version" })
    expect(JSON.stringify(result)).not.toContain("public-capability")
  })
})
