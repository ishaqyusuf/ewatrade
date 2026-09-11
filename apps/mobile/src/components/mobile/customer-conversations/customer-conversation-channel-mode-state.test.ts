import { describe, expect, test } from "bun:test"

import {
  resolveCustomerConversationChannelModeState,
  resolveCustomerConversationDisabledComposerLabel,
} from "./customer-conversation-channel-mode-state"

describe("native Customer Conversation channel mode", () => {
  test("renders no WhatsApp action for Chat-only mode", () => {
    expect(
      resolveCustomerConversationChannelModeState({
        opening: false,
        whatsappAction: null,
      }),
    ).toBeNull()
  })

  test("keeps WhatsApp-only primary and history-readable", () => {
    expect(
      resolveCustomerConversationChannelModeState({
        opening: false,
        whatsappAction: "continue_on_whatsapp",
      }),
    ).toMatchObject({
      badge: "WhatsApp only",
      detail:
        "Your ẸwáTrade history stays here. Continue securely with the Store on its current verified route.",
      label: "Continue on WhatsApp",
      primary: true,
      showHistoryContext: true,
      title: "New messages use WhatsApp",
    })
  })

  test("disables duplicate intent through a truthful loading state", () => {
    expect(
      resolveCustomerConversationChannelModeState({
        opening: true,
        whatsappAction: "reach_store_faster_on_whatsapp",
      }),
    ).toMatchObject({
      badge: "Optional faster reply",
      detail:
        "Your ẸwáTrade chat and draft stay here. We'll prepare a private one-time handoff to the Store's current verified route.",
      label: "Preparing WhatsApp…",
      primary: false,
      showHistoryContext: false,
      title: "Continue on WhatsApp when you choose",
    })
  })

  test("connects the disabled composer to WhatsApp-only recovery", () => {
    expect(
      resolveCustomerConversationDisabledComposerLabel({
        composerEnabled: false,
        whatsappAction: "continue_on_whatsapp",
      }),
    ).toBe("Continue on WhatsApp above")
    expect(
      resolveCustomerConversationDisabledComposerLabel({
        composerEnabled: false,
        whatsappAction: null,
      }),
    ).toBe("Messaging is unavailable")
    expect(
      resolveCustomerConversationDisabledComposerLabel({
        composerEnabled: true,
        whatsappAction: "reach_store_faster_on_whatsapp",
      }),
    ).toBeNull()
  })
})
