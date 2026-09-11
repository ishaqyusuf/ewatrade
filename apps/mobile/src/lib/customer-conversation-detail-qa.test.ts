import { describe, expect, test } from "bun:test"

import {
  parseCustomerConversationDetailQaState,
  projectCustomerConversationDetailQaInteractions,
} from "./customer-conversation-detail-qa"

describe("parseCustomerConversationDetailQaState", () => {
  test("admits only exact development detail states", () => {
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "active",
      }),
    ).toBe("active")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "new",
      }),
    ).toBe("new")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "request-choice",
      }),
    ).toBe("request-choice")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "attachment-picker",
      }),
    ).toBe("attachment-picker")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "voice-recording",
      }),
    ).toBe("voice-recording")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "voice-preview",
      }),
    ).toBe("voice-preview")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "foreground-response",
      }),
    ).toBe("foreground-response")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "availability-paused",
      }),
    ).toBe("availability-paused")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "quote-current",
      }),
    ).toBe("quote-current")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "account-invitation",
      }),
    ).toBe("account-invitation")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "notification-setup",
      }),
    ).toBe("notification-setup")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "mixed-timeline",
      }),
    ).toBe("mixed-timeline")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "privacy-restricted",
      }),
    ).toBe("privacy-restricted")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "whatsapp-only",
      }),
    ).toBe("whatsapp-only")
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "whatsapp-bridge",
      }),
    ).toBe("whatsapp-bridge")
    expect(
      parseCustomerConversationDetailQaState({
        development: false,
        qaState: "request-choice",
      }),
    ).toBeNull()
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: ["active"],
      }),
    ).toBeNull()
    expect(
      parseCustomerConversationDetailQaState({
        development: true,
        qaState: "unknown",
      }),
    ).toBeNull()
  })
})

describe("projectCustomerConversationDetailQaInteractions", () => {
  test("keeps the Quote and account invitation visible but inert together", () => {
    expect(
      projectCustomerConversationDetailQaInteractions("account-invitation"),
    ).toEqual({
      accountInvitationInteractive: false,
      quoteInteractive: false,
    })
  })

  test("disables only the interaction owned by other deterministic states", () => {
    expect(
      projectCustomerConversationDetailQaInteractions("quote-current"),
    ).toEqual({
      accountInvitationInteractive: true,
      quoteInteractive: false,
    })
    expect(projectCustomerConversationDetailQaInteractions("active")).toEqual({
      accountInvitationInteractive: true,
      quoteInteractive: true,
    })
    expect(
      projectCustomerConversationDetailQaInteractions("privacy-restricted"),
    ).toEqual({
      accountInvitationInteractive: true,
      quoteInteractive: false,
    })
  })
})
