import { describe, expect, test } from "bun:test"
import { advanceStoreConversationActionReturn } from "@ewatrade/utils"
import { renderToStaticMarkup } from "react-dom/server"

import { StoreConversationQuoteMessage } from "./store-conversation-quote-message"
import {
  WEB_QUOTE_MESSAGE_LAYOUT,
  projectWebQuoteActionButton,
  projectWebQuoteMessageFeedback,
  requestWebQuoteAction,
} from "./store-conversation-quote-message-state"

const actionMessage = {
  actions: [
    {
      action: "choose_quote_option" as const,
      amountMinor: 30_000,
      capabilityToken: "action-capability-token-that-is-long-enough",
      confirmation: "required" as const,
      consequence: "Select this exact quotation option.",
      currencyCode: "NGN",
      expiresAt: new Date("2030-01-02T00:00:00.000Z"),
      label: "Choose Express",
    },
  ],
  currencyCode: "NGN",
  kind: "quote" as const,
  lifecycle: "current" as const,
  options: [
    {
      id: "option-standard",
      label: "Standard",
      position: 1,
      selected: false,
      totalMinor: 20_000,
    },
    {
      id: "option-express",
      label: "Express",
      position: 2,
      selected: false,
      totalMinor: 30_000,
    },
  ],
  quoteVersion: 2,
  recovery: null,
}

describe("Store Conversation web Quote message", () => {
  test("renders server-materialized actions without a loading placeholder", () => {
    const markup = renderToStaticMarkup(
      <StoreConversationQuoteMessage
        actionMessage={actionMessage}
        conversationId="conversation-1"
        messageId="message-1"
        onContactStore={() => undefined}
        onRefresh={async () => undefined}
        publicToken="published-entry-token-that-is-long-enough"
      />,
    )

    expect(markup).toContain("Quotation")
    expect(markup).toContain("₦300.00")
    expect(markup).toContain('aria-label="Choose Express"')
    expect(markup).toContain(WEB_QUOTE_MESSAGE_LAYOUT.compactWidthClass)
    expect(markup).toContain(WEB_QUOTE_MESSAGE_LAYOUT.actionMinHeightClass)
    expect(markup).not.toContain("Checking available actions")
    expect(markup).not.toContain("₦500.00")
  })

  test("models loading, retry, confirmation and pending labels accessibly", () => {
    expect(
      projectWebQuoteMessageFeedback({ error: null, loading: true }),
    ).toEqual({
      actionsVisible: false,
      retryVisible: false,
      status: "Checking available actions…",
    })
    expect(
      projectWebQuoteMessageFeedback({
        error: "Checkout is temporarily unavailable. Try again.",
        loading: false,
      }),
    ).toEqual({
      actionsVisible: false,
      retryVisible: true,
      status: "Checkout is temporarily unavailable. Try again.",
    })
    const action = actionMessage.actions[0]
    if (!action) throw new Error("Action fixture missing")
    expect(requestWebQuoteAction(null, action)).toEqual({
      confirmingToken: action.capabilityToken,
      execute: false,
    })
    expect(
      projectWebQuoteActionButton(action, {
        confirming: true,
        pending: true,
      }),
    ).toEqual({
      accessibilityLabel: "Confirm Choose Express",
      label: "Working…",
    })
  })

  test("refreshes authoritative actions after an external checkout return", () => {
    const armed = advanceStoreConversationActionReturn("idle", "handoff_opened")
    const away = advanceStoreConversationActionReturn(armed.state, "inactive")
    expect(advanceStoreConversationActionReturn(away.state, "active")).toEqual({
      refresh: true,
      state: "idle",
    })
  })

  test("renders terminal recovery without a stale action button", () => {
    const markup = renderToStaticMarkup(
      <StoreConversationQuoteMessage
        actionMessage={{
          ...actionMessage,
          actions: [],
          lifecycle: "revoked",
          recovery: "talk_to_store",
        }}
        conversationId="conversation-1"
        messageId="message-1"
        onContactStore={() => undefined}
        onRefresh={async () => undefined}
        publicToken="published-entry-token-that-is-long-enough"
      />,
    )

    expect(markup).toContain("Message store")
    expect(markup).not.toContain("Choose Express</button>")
  })
})
