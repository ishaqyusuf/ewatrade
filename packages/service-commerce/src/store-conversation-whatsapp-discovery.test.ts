import { describe, expect, test } from "bun:test"

import {
  deriveStoreConversationWhatsAppCandidateActionToken,
  parseStoreConversationWhatsAppCandidateActionToken,
} from "./store-conversation-whatsapp-bridge-server"
import {
  projectCurrentStoreConversationWhatsAppObservedStatus,
  projectStoreConversationWhatsAppCandidatePrompt,
  storeConversationWhatsAppObservedStatusLabel,
  storeConversationWhatsAppProviderHistoryAvailability,
} from "./store-conversation-whatsapp-discovery"

const secret = "test-secret-with-at-least-thirty-two-characters"

describe("Store Conversation direct WhatsApp discovery", () => {
  test("projects only one neutral three-action candidate prompt", () => {
    const prompt = projectStoreConversationWhatsAppCandidatePrompt()

    expect(prompt).toEqual({
      actions: [
        { action: "continue", label: "Continue that conversation" },
        { action: "start_new", label: "Start a new request" },
        { action: "not_mine", label: "That isn't mine" },
      ],
      message:
        "A recent EwaTrade conversation may be available for this Store. Choose how to continue.",
    })
    expect(JSON.stringify(prompt)).not.toMatch(
      /prescription|quote|amount|account|device|request kind|preview/i,
    )
  })

  test("uses provider occurrence time before callback arrival order", () => {
    const deliveredAt = new Date("2026-08-16T11:02:00.000Z")
    const readAt = new Date("2026-08-16T11:03:00.000Z")

    expect(
      projectCurrentStoreConversationWhatsAppObservedStatus([
        {
          occurredAt: readAt,
          provenance: "cloud_api_outbound",
          status: "read",
        },
        {
          occurredAt: deliveredAt,
          provenance: "cloud_api_outbound",
          status: "delivered",
        },
      ]),
    ).toEqual({
      occurredAt: readAt,
      provenance: "cloud_api_outbound",
      status: "read",
    })
  })

  test("keeps unsupported provider history explicitly unavailable", () => {
    expect(
      storeConversationWhatsAppProviderHistoryAvailability({
        businessAppHistoryAuthorized: true,
        providerSupportsHistory: false,
      }),
    ).toBe("provider_history_unavailable")
    expect(
      storeConversationWhatsAppProviderHistoryAvailability({
        businessAppHistoryAuthorized: true,
        providerSupportsHistory: true,
      }),
    ).toBe("available")
  })

  test("labels provider status without claiming EwaTrade device read state", () => {
    expect(storeConversationWhatsAppObservedStatusLabel("delivered")).toBe(
      "delivered by WhatsApp",
    )
    expect(storeConversationWhatsAppObservedStatusLabel("read")).toBe(
      "read on WhatsApp",
    )
  })

  test("derives opaque action capabilities without exposing candidate scope", () => {
    const token = deriveStoreConversationWhatsAppCandidateActionToken({
      action: "continue",
      candidateId: "candidate_private_1",
      revision: 3,
      secret,
    })

    expect(parseStoreConversationWhatsAppCandidateActionToken(token)).toBe(
      token,
    )
    expect(token).toMatch(/^ewc1_[A-Za-z0-9_-]{43}$/)
    expect(token).not.toContain("candidate_private_1")
  })
})
