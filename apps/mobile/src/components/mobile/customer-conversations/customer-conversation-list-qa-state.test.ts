import { describe, expect, test } from "bun:test"

import { isCustomerConversationListQaState } from "@/lib/customer-conversation-list-qa"
import { resolveCustomerConversationListQaItems } from "./customer-conversation-list-qa-state"

describe("Customer Conversation populated-list QA state", () => {
  test("allows only explicit development QA states", () => {
    expect(
      isCustomerConversationListQaState({
        development: true,
        qaState: "empty",
      }),
    ).toBe(true)
    expect(
      isCustomerConversationListQaState({
        development: true,
        qaState: "populated",
      }),
    ).toBe(true)
    expect(
      isCustomerConversationListQaState({
        development: true,
        qaState: "unavailable",
      }),
    ).toBe(true)
    expect(
      isCustomerConversationListQaState({
        development: true,
        qaState: "other",
      }),
    ).toBe(false)
    expect(
      isCustomerConversationListQaState({
        development: false,
        qaState: "populated",
      }),
    ).toBe(false)
  })

  test("returns no projection outside development", () => {
    expect(
      resolveCustomerConversationListQaItems({
        development: false,
        now: new Date("2026-08-25T08:00:00.000Z"),
        qaState: "populated",
      }),
    ).toBeNull()
  })

  test("returns an explicit empty no-query projection in development", () => {
    expect(
      resolveCustomerConversationListQaItems({
        development: true,
        qaState: "empty",
      }),
    ).toEqual([])
  })

  test("returns a deterministic, newest-first populated list in development", () => {
    const items = resolveCustomerConversationListQaItems({
      development: true,
      now: new Date("2026-08-25T08:00:00.000Z"),
      qaState: "populated",
    })

    expect(items?.map((item) => item.storeName)).toEqual([
      "Luma Pharmacy",
      "Northstar Tailoring",
      "Adebayo Electronics",
      "Green Basket Grocers",
    ])
    expect(items?.[0]).toMatchObject({
      lastMessage: {
        author: "store",
        text: "Your order is ready for pickup.",
      },
      state: "active",
      unreadStoreMessages: 3,
    })
    expect(items?.[2]).toMatchObject({
      lastMessage: { author: "system", text: "Quote accepted" },
      state: "archived",
      unreadStoreMessages: 0,
    })
  })
})
