import { describe, expect, test } from "bun:test"
import { advanceStoreConversationActionReturn } from "@ewatrade/utils"

import {
  CUSTOMER_QUOTE_MESSAGE_LAYOUT,
  projectCustomerQuoteActionButton,
  projectCustomerQuoteHeading,
  projectCustomerQuoteMessageFeedback,
  requestCustomerQuoteAction,
} from "./customer-quote-message-state"

const action = {
  capabilityToken: "action-capability-token-that-is-long-enough",
  confirmation: "required" as const,
  label: "Pay now",
}

describe("Customer mobile Quote message state", () => {
  test("presents a current Quote as ready without weakening confirmation", () => {
    expect(
      projectCustomerQuoteHeading({
        confirmationRequired: true,
        lifecycle: "current",
        quoteVersion: 2,
      }),
    ).toEqual({
      eyebrow: "Quote · Version 2",
      guidance: "Choose one option. You’ll confirm before anything changes.",
      status: "Ready",
      title: "Your quotation",
    })
  })

  test("requires one explicit confirmation before a consequential action", () => {
    expect(requestCustomerQuoteAction(null, action)).toEqual({
      confirmingToken: action.capabilityToken,
      execute: false,
    })
    expect(requestCustomerQuoteAction(action.capabilityToken, action)).toEqual({
      confirmingToken: action.capabilityToken,
      execute: true,
    })
  })

  test("keeps native accessibility labels truthful while pending", () => {
    expect(
      projectCustomerQuoteActionButton(action, {
        confirming: true,
        pending: false,
      }),
    ).toEqual({
      accessibilityLabel: "Confirm Pay now",
      label: "Confirm Pay now",
    })
    expect(
      projectCustomerQuoteActionButton(action, {
        confirming: true,
        pending: true,
      }),
    ).toEqual({ accessibilityLabel: "Confirm Pay now", label: "Working…" })
  })

  test("models native loading and retry recovery without stale actions", () => {
    expect(
      projectCustomerQuoteMessageFeedback({ error: null, loading: true }),
    ).toEqual({
      actionsVisible: false,
      retryVisible: false,
      status: "Checking available actions…",
    })
    expect(
      projectCustomerQuoteMessageFeedback({
        error: "Checkout is temporarily unavailable. Try again.",
        loading: false,
      }),
    ).toEqual({
      actionsVisible: false,
      retryVisible: true,
      status: "Checkout is temporarily unavailable. Try again.",
    })
  })

  test("keeps compact layout and action targets at the approved native bounds", () => {
    expect(CUSTOMER_QUOTE_MESSAGE_LAYOUT).toEqual({
      actionMinHeightClass: "min-h-11",
      compactWidthClass: "max-w-[92%]",
    })
  })

  test("refreshes authoritative state after the app returns from checkout", () => {
    const armed = advanceStoreConversationActionReturn("idle", "handoff_opened")
    const away = advanceStoreConversationActionReturn(armed.state, "inactive")
    expect(advanceStoreConversationActionReturn(away.state, "active")).toEqual({
      refresh: true,
      state: "idle",
    })
  })
})
