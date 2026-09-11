import { describe, expect, test } from "bun:test"

import {
  isCustomerConversationListUnavailableQaState,
  resolveCustomerConversationListEmptyPresentation,
} from "./customer-conversation-list-empty-presentation"

describe("Customer Conversation list empty presentation", () => {
  test("uses a direct connection recovery state", () => {
    expect(
      resolveCustomerConversationListEmptyPresentation({
        credentialRejected: false,
        error: true,
        loading: false,
      }),
    ).toEqual({
      actionLabel: "Try again",
      icon: "WifiOff",
      message: "Check your connection and try again.",
      mode: "error",
      title: "Conversations unavailable",
    })
  })

  test("keeps loading ahead of error projection", () => {
    expect(
      resolveCustomerConversationListEmptyPresentation({
        credentialRejected: false,
        error: true,
        loading: true,
      }),
    ).toEqual({ mode: "loading" })
  })

  test("does not offer retry after the guest credential is rejected", () => {
    expect(
      resolveCustomerConversationListEmptyPresentation({
        credentialRejected: true,
        error: true,
        loading: false,
      }),
    ).toEqual({ mode: "hidden" })
  })

  test("keeps a successful empty list visually quiet", () => {
    expect(
      resolveCustomerConversationListEmptyPresentation({
        credentialRejected: false,
        error: false,
        loading: false,
      }),
    ).toEqual({
      icon: "MessageCircle",
      message:
        "Open a store’s ẸwáTrade chat link to start a conversation. It will stay here when you come back.",
      mode: "empty",
      sourceLabel: "Chats start from a store link",
      title: "No conversations yet",
    })
  })

  test("allows deterministic unavailable-state QA only in development", () => {
    expect(
      isCustomerConversationListUnavailableQaState({
        development: true,
        qaState: "unavailable",
      }),
    ).toBe(true)
    expect(
      isCustomerConversationListUnavailableQaState({
        development: false,
        qaState: "unavailable",
      }),
    ).toBe(false)
  })
})
