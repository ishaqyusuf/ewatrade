import { describe, expect, test } from "bun:test"

import {
  storeConversationNotificationContactRequestInputSchema,
  storeConversationPushEndpointInputSchema,
} from "./schemas/store-conversation-notifications"
import {
  maskStoreConversationNotificationDestination,
  prioritizeStoreConversationNotificationChannel,
  renderStoreConversationNeutralNotification,
  selectStoreConversationNotificationChannel,
} from "./store-conversation-notifications"

describe("Store Conversation notification contracts", () => {
  test("accepts explicit notification-only contact consent", () => {
    const result = storeConversationNotificationContactRequestInputSchema.parse(
      {
        channel: "email",
        clientOperationId: "verify_contact_1",
        consentAccepted: true,
        conversationId: "conversation_1",
        destination: "customer@example.com",
        publicToken: "p".repeat(32),
      },
    )
    expect(result.destination).toBe("customer@example.com")
    expect(JSON.stringify(result)).not.toContain("marketing")
  })

  test("rejects malformed channel destinations and push endpoints", () => {
    expect(() =>
      storeConversationNotificationContactRequestInputSchema.parse({
        channel: "whatsapp",
        clientOperationId: "verify_contact_2",
        consentAccepted: true,
        conversationId: "conversation_1",
        destination: "0800 local",
        publicToken: "p".repeat(32),
      }),
    ).toThrow()
    expect(() =>
      storeConversationPushEndpointInputSchema.parse({
        clientOperationId: "register_push_1",
        conversationId: "conversation_1",
        expoPushToken: "not-a-token",
        kind: "native_expo",
        publicToken: "p".repeat(32),
      }),
    ).toThrow()
  })

  test("prefers the first currently eligible configured channel", () => {
    expect(
      selectStoreConversationNotificationChannel({
        eligibility: { email: true, push: false, whatsapp: true },
        orderedChannels: ["push", "email", "whatsapp"],
      }),
    ).toBe("email")
    expect(
      selectStoreConversationNotificationChannel({
        eligibility: { email: false, push: false, whatsapp: false },
        orderedChannels: ["push", "email", "whatsapp"],
      }),
    ).toBeNull()
  })

  test("moves one preferred channel first without duplicating fallbacks", () => {
    expect(
      prioritizeStoreConversationNotificationChannel({
        channel: "email",
        orderedChannels: ["push", "email", "whatsapp"],
      }),
    ).toEqual(["email", "push", "whatsapp"])
  })

  test("renders only bounded neutral Store notifications", () => {
    const unread = renderStoreConversationNeutralNotification({
      kind: "unread_response",
      storeName: `  North   Pharmacy ${"x".repeat(100)} `,
    })
    const reopened = renderStoreConversationNeutralNotification({
      kind: "store_reopened",
      storeName: "North Pharmacy",
    })
    expect(unread.body).toStartWith(
      "You have a new response from North Pharmacy",
    )
    expect(unread.body.length).toBeLessThan(130)
    expect(reopened.body).toBe(
      "North Pharmacy is available on EwaTrade Chat again.",
    )
    expect(JSON.stringify([unread, reopened])).not.toMatch(
      /medicine|prescription|quote|payment|attachment/i,
    )
  })

  test("masks destinations without returning their original value", () => {
    expect(
      maskStoreConversationNotificationDestination({
        channel: "email",
        destination: "customer@example.com",
      }),
    ).toBe("cu•••@example.com")
    expect(
      maskStoreConversationNotificationDestination({
        channel: "whatsapp",
        destination: "+2348012345678",
      }),
    ).toEndWith("5678")
  })
})
