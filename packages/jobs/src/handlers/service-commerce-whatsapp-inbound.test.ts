import { describe, expect, test } from "bun:test"

import {
  type ServiceCommerceWhatsAppInboundDependencies,
  runServiceCommerceWhatsAppInbound,
} from "./service-commerce-whatsapp-inbound"

function claim(normalizedPayload: Record<string, unknown>) {
  return {
    connectionId: "connection_1",
    credentialReference: "private",
    externalCustomerId: "+2348000000000",
    inboundEventId: "event_1",
    messageType: "image",
    normalizedPayload:
      normalizedPayload as unknown as ClaimPayload["normalizedPayload"],
    phoneNumberId: "phone_1",
    providerEventId: "wamid_1",
    requestId: null,
    routeVertical: "service" as const,
    storeId: "store_1",
    tenantId: "tenant_1",
  }
}

type ClaimPayload = NonNullable<
  Awaited<ReturnType<ServiceCommerceWhatsAppInboundDependencies["claim"]>>
>

function dependencies(
  normalizedPayload: Record<string, unknown>,
  calls: string[],
): ServiceCommerceWhatsAppInboundDependencies {
  return {
    bindBridgeRequest: async () => {
      calls.push("bind-bridge-request")
      return { message: {}, replayed: false } as never
    },
    bindDirectSession: async () => {
      calls.push("bind-direct-session")
      return {
        conversationId: "conversation_1",
        directSessionId: "direct_1",
        replayed: false,
      }
    },
    claim: async () => claim(normalizedPayload),
    complete: async (input) => {
      calls.push(`complete:${input.failureCode ?? "ok"}`)
    },
    digestProviderEvent: () => "d".repeat(64),
    enqueueMedia: async () => {
      calls.push("enqueue-media")
    },
    protectRecipient: () => "recipient_ciphertext",
    recordMedia: async () => {
      calls.push("record-media")
      return {
        attachment: { id: "attachment_1" },
        media: { id: "media_1" },
        replayed: false,
      } as never
    },
    resolveAttachmentTarget: async () => ({
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
      sourceLineId: "line_1",
      sourceVersion: "version_1",
    }),
    retry: async () => {
      calls.push("retry")
    },
    submit: async () => ({
      channel: "whatsapp",
      replayed: false,
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
      status: "accepted",
    }),
  }
}

describe("Service Commerce WhatsApp inbound", () => {
  test("requires an explicit source selection instead of guessing", async () => {
    const calls: string[] = []
    await expect(
      runServiceCommerceWhatsAppInbound(
        { inboundEventId: "event_1" },
        dependencies({ text: "Is this available?" }, calls),
      ),
    ).resolves.toEqual({ status: "source_selection_required" })
    expect(calls).toEqual(["complete:source_selection_required"])
  })

  test("records a bag image against the accepted Inquiry before ingestion", async () => {
    const calls: string[] = []
    await expect(
      runServiceCommerceWhatsAppInbound(
        { inboundEventId: "event_1" },
        dependencies(
          {
            intakeKind: "commerce_inquiry",
            mediaId: "media_provider_1",
            mediaType: "image/jpeg",
          },
          calls,
        ),
      ),
    ).resolves.toMatchObject({
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
      status: "accepted",
    })
    expect(calls).toEqual([
      "record-media",
      "enqueue-media",
      "bind-direct-session",
    ])
  })

  test("records a customer PDF as a private document before ingestion", async () => {
    const calls: string[] = []
    let mediaInput: {
      fileName: string
      kind: string
      mimeType: string
    } | null = null
    const injected = dependencies(
      {
        intakeKind: "commerce_inquiry",
        mediaId: "document_provider_1",
        mediaType: "application/pdf",
      },
      calls,
    )
    injected.recordMedia = async (input) => {
      mediaInput = input
      calls.push("record-media")
      return {
        attachment: { id: "attachment_1" },
        media: { id: "media_1" },
        replayed: false,
      } as never
    }

    await expect(
      runServiceCommerceWhatsAppInbound(
        { inboundEventId: "event_1" },
        injected,
      ),
    ).resolves.toMatchObject({ status: "accepted" })
    expect(mediaInput).toMatchObject({
      fileName: "customer-document.pdf",
      kind: "document",
      mimeType: "application/pdf",
    })
    expect(calls).toEqual([
      "record-media",
      "enqueue-media",
      "bind-direct-session",
    ])
  })

  test("releases transient failures for durable retry", async () => {
    const calls: string[] = []
    const injected = dependencies(
      { intakeKind: "commerce_inquiry", text: "Is this available?" },
      calls,
    )
    injected.submit = async () => {
      throw new Error("temporary Neon failure")
    }
    await expect(
      runServiceCommerceWhatsAppInbound(
        { inboundEventId: "event_1" },
        injected,
      ),
    ).rejects.toThrow("temporary Neon failure")
    expect(calls).toEqual(["retry"])
  })

  test("binds a newly dispatched typed Inquiry back to the exact durable bridge", async () => {
    const calls: string[] = []
    let bridgeInput: Record<string, unknown> | null = null
    const injected = dependencies(
      {
        bridgeExternalCustomerIdDigest: "e".repeat(64),
        bridgeId: "bridge_1",
        intakeKind: "commerce_inquiry",
        text: "I need a red bag",
      },
      calls,
    )
    injected.bindBridgeRequest = async (input) => {
      bridgeInput = input
      calls.push("bind-bridge-request")
      return { message: {}, replayed: false } as never
    }

    await expect(
      runServiceCommerceWhatsAppInbound(
        { inboundEventId: "event_1" },
        injected,
      ),
    ).resolves.toMatchObject({ status: "accepted" })
    expect(bridgeInput).toMatchObject({
      bridgeId: "bridge_1",
      connectionId: "connection_1",
      externalCustomerIdDigest: "e".repeat(64),
      providerEventDigest: "d".repeat(64),
      sourceId: "inquiry_1",
      sourceKind: "COMMERCE_INQUIRY",
      storeId: "store_1",
      tenantId: "tenant_1",
      text: "I need a red bag",
    })
    expect(calls).toEqual(["bind-bridge-request", "complete:ok"])
  })
})
