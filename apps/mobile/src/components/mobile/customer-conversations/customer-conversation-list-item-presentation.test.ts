import { describe, expect, test } from "bun:test"

import {
  formatCustomerConversationActivity,
  getCustomerConversationListItemPresentation,
} from "./customer-conversation-list-item-presentation"

describe("formatCustomerConversationActivity", () => {
  const now = new Date(2026, 7, 25, 20, 0)

  test("uses compact, human activity labels", () => {
    expect(
      formatCustomerConversationActivity(
        new Date(2026, 7, 25, 19, 42),
        now,
        "en-US",
      ),
    ).toBe("7:42 PM")
    expect(
      formatCustomerConversationActivity(
        new Date(2026, 7, 24, 18, 0),
        now,
        "en-US",
      ),
    ).toBe("Yesterday")
    expect(
      formatCustomerConversationActivity(
        new Date(2026, 7, 22, 18, 0),
        now,
        "en-US",
      ),
    ).toBe("Saturday")
    expect(
      formatCustomerConversationActivity(
        new Date(2026, 7, 14, 18, 0),
        now,
        "en-US",
      ),
    ).toBe("Aug 14")
  })
})

describe("getCustomerConversationListItemPresentation", () => {
  test("uses a concise author label and announces unread messages", () => {
    expect(
      getCustomerConversationListItemPresentation({
        lastActivityAt: new Date(2026, 7, 25, 19, 42),
        lastMessage: {
          author: "store",
          text: "Your order is ready for pickup.",
        },
        locale: "en-US",
        now: new Date(2026, 7, 25, 20, 0),
        state: "active",
        storeName: "Luma Pharmacy",
        unreadStoreMessages: 3,
      }),
    ).toEqual({
      accessibilityHint:
        "Open conversation. Store: Your order is ready for pickup. Last activity 7:42 PM.",
      accessibilityLabel: "Luma Pharmacy, 3 unread messages",
      activityLabel: "7:42 PM",
      preview: {
        authorLabel: "Store",
        text: "Your order is ready for pickup.",
      },
      status: null,
      unreadLabel: "3",
    })
  })

  test("makes archived and restricted states explicit", () => {
    expect(
      getCustomerConversationListItemPresentation({
        lastActivityAt: new Date(2026, 7, 22, 18, 0),
        lastMessage: { author: "system", text: "Quote accepted" },
        now: new Date(2026, 7, 25, 20, 0),
        state: "archived",
        storeName: "Adebayo Electronics",
        unreadStoreMessages: 0,
      }).status,
    ).toEqual({ label: "Archived", tone: "muted" })
    expect(
      getCustomerConversationListItemPresentation({
        lastActivityAt: new Date(2026, 7, 14, 18, 0),
        lastMessage: null,
        now: new Date(2026, 7, 25, 20, 0),
        state: "restricted",
        storeName: "Green Basket Grocers",
        unreadStoreMessages: 0,
      }).status,
    ).toEqual({ label: "Messaging restricted", tone: "destructive" })
  })
})
