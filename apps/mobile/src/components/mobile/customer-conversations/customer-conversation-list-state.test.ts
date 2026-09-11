import { describe, expect, test } from "bun:test"

import {
  canFetchCustomerConversationListNextPage,
  mergeCustomerConversationAccessItems,
} from "./customer-conversation-list-state"

const account = {
  conversationId: "conversation-1",
  lastActivityAt: "2026-08-24T10:00:00.000Z",
  source: "account",
}
const guest = {
  conversationId: "conversation-1",
  lastActivityAt: "2026-08-24T09:00:00.000Z",
  source: "guest",
}

describe("Customer Conversation list access merge", () => {
  test("preserves account access when account and guest results overlap", () => {
    expect(
      mergeCustomerConversationAccessItems({
        accountItems: [account],
        credentialRejected: false,
        guestItems: [guest],
        qaUnavailable: false,
      }),
    ).toEqual([{ ...account, access: "account" }])
  })

  test("drops cached guest rows after credential rejection", () => {
    expect(
      mergeCustomerConversationAccessItems({
        accountItems: [],
        credentialRejected: true,
        guestItems: [guest],
        qaUnavailable: false,
      }),
    ).toEqual([])
  })

  test("projects an empty deterministic list for no-query QA", () => {
    expect(
      mergeCustomerConversationAccessItems({
        accountItems: [account],
        credentialRejected: false,
        guestItems: [guest],
        qaUnavailable: true,
      }),
    ).toEqual([])
  })

  test("blocks cached pagination in no-query QA", () => {
    expect(
      canFetchCustomerConversationListNextPage({
        hasNextPage: true,
        isFetchingNextPage: false,
        qaIsolated: true,
      }),
    ).toBe(false)
  })
})
