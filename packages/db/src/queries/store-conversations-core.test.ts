import { describe, expect, test } from "bun:test"

import {
  assertStoreConversationComposerEnabled,
  loadStoreConversationForGuest,
  projectStoreConversationMessage,
} from "./store-conversations-core"

describe("Store Conversation guest authorization", () => {
  test("fails customer writes closed when the server-derived mode disables Chat", () => {
    expect(() =>
      assertStoreConversationComposerEnabled({
        chat: { available: true, blockers: [] },
        composerEnabled: false,
        desiredMode: "whatsapp",
        effectiveMode: "whatsapp",
        historyReadable: true,
        revision: 3,
        whatsapp: { available: true, blockers: [] },
        whatsappAction: "continue_on_whatsapp",
      }),
    ).toThrow("accepting new messages on WhatsApp")
  })

  test("can authorize an authoritative operation without touching session telemetry", async () => {
    let credentialUpdates = 0
    let identityUpdates = 0
    const db = {
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          store: { name: "QA Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationGuestCredential: {
        findFirst: async () => ({
          guestIdentity: { id: "guest_1", status: "ACTIVE" },
          guestIdentityId: "guest_1",
          id: "credential_1",
        }),
        update: async () => {
          credentialUpdates += 1
        },
      },
      storeConversationGuestIdentity: {
        update: async () => {
          identityUpdates += 1
        },
      },
    }

    const result = await loadStoreConversationForGuest(
      db as never,
      {
        conversationId: "conversation_1",
        credentialToken: "credential-token-that-is-long-enough",
        now: new Date("2030-01-01T00:00:00.000Z"),
        storeId: "store_1",
        tenantId: "tenant_1",
        touchCredential: false,
      } as never,
    )

    expect(result.conversation.id).toBe("conversation_1")
    expect(credentialUpdates).toBe(0)
    expect(identityUpdates).toBe(0)
  })

  test("projects observed WhatsApp status without changing EwaTrade read state", () => {
    const message = projectStoreConversationMessage({
      authorKind: "STORE_ATTENDANT",
      body: "Your quote is ready",
      channel: "WHATSAPP",
      id: "message_1",
      kind: "STORE_TEXT",
      occurredAt: new Date("2026-08-16T13:00:00.000Z"),
      sequence: 8,
      whatsAppObservation: {
        provenance: "CLOUD_API_OUTBOUND",
        status: "DELIVERED",
        statusOccurredAt: new Date("2026-08-16T13:00:08.000Z"),
      },
    })

    expect(message.whatsAppObservation).toEqual({
      occurredAt: new Date("2026-08-16T13:00:08.000Z"),
      provenance: "cloud_api_outbound",
      status: "delivered",
    })
    expect(JSON.stringify(message)).not.toMatch(/readThrough|deliveredThrough/)
  })
})
