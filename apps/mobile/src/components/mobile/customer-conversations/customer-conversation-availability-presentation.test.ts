import { describe, expect, test } from "bun:test"

import { projectCustomerConversationAvailability } from "./customer-conversation-availability-presentation"

describe("projectCustomerConversationAvailability", () => {
  test("keeps paused chat history readable and labels a local draft beside the composer", () => {
    expect(
      projectCustomerConversationAvailability({
        available: false,
        customerMessage: "Luma Pharmacy has paused new chat messages.",
        formatReopensAt: () => "4:00 PM",
        hasUnsentDraft: true,
        reopensAt: new Date("2026-08-26T15:00:00.000Z"),
      }),
    ).toEqual({
      accessibilityLabel:
        "Chat paused until 4:00 PM. Luma Pharmacy has paused new chat messages. You can still read this conversation.",
      detail:
        "Luma Pharmacy has paused new chat messages. You can still read this conversation.",
      draftDetail: "It won’t send until chat reopens.",
      draftTitle: "Draft saved on this device",
      icon: "Clock",
      title: "Chat paused until 4:00 PM",
      tone: "warning",
    })
  })

  test("uses safe indefinite copy without inventing a reopening time", () => {
    expect(
      projectCustomerConversationAvailability({
        available: false,
        customerMessage: null,
        hasUnsentDraft: false,
        reopensAt: null,
      }),
    ).toEqual({
      accessibilityLabel:
        "Chat is paused. The Store isn’t accepting new messages right now. You can still read this conversation.",
      detail:
        "The Store isn’t accepting new messages right now. You can still read this conversation.",
      draftDetail: null,
      draftTitle: null,
      icon: "Clock",
      title: "Chat is paused",
      tone: "warning",
    })
  })

  test("renders no availability interruption while chat is available", () => {
    expect(
      projectCustomerConversationAvailability({
        available: true,
        customerMessage: null,
        hasUnsentDraft: true,
        reopensAt: null,
      }),
    ).toBeNull()
  })
})
