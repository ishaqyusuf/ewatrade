import { describe, expect, test } from "bun:test"

import type { StoreConversationChannelReadiness } from "./schemas/store-conversation-channel-mode"
import type { StoreConversationDesiredMode } from "./schemas/store-conversation-channel-mode"
import { deriveStoreConversationChannelMode } from "./store-conversation-channel-mode"

const available: StoreConversationChannelReadiness = {
  available: true,
  blockers: [],
}
const chatUnavailable: StoreConversationChannelReadiness = {
  available: false,
  blockers: ["chat_unavailable"],
}
const whatsappUnavailable: StoreConversationChannelReadiness = {
  available: false,
  blockers: ["whatsapp_provider_unavailable"],
}

describe("Store Conversation channel mode", () => {
  test("derives every desired mode against every current readiness combination", () => {
    const cases: Array<{
      chat: StoreConversationChannelReadiness
      desiredMode: StoreConversationDesiredMode
      effectiveMode: "ewatrade_chat" | "whatsapp" | "both" | "unavailable"
      whatsapp: StoreConversationChannelReadiness
    }> = [
      {
        chat: available,
        desiredMode: "ewatrade_chat",
        effectiveMode: "ewatrade_chat",
        whatsapp: available,
      },
      {
        chat: available,
        desiredMode: "ewatrade_chat",
        effectiveMode: "ewatrade_chat",
        whatsapp: whatsappUnavailable,
      },
      {
        chat: chatUnavailable,
        desiredMode: "ewatrade_chat",
        effectiveMode: "unavailable",
        whatsapp: available,
      },
      {
        chat: chatUnavailable,
        desiredMode: "ewatrade_chat",
        effectiveMode: "unavailable",
        whatsapp: whatsappUnavailable,
      },
      {
        chat: available,
        desiredMode: "whatsapp",
        effectiveMode: "whatsapp",
        whatsapp: available,
      },
      {
        chat: available,
        desiredMode: "whatsapp",
        effectiveMode: "unavailable",
        whatsapp: whatsappUnavailable,
      },
      {
        chat: chatUnavailable,
        desiredMode: "whatsapp",
        effectiveMode: "whatsapp",
        whatsapp: available,
      },
      {
        chat: chatUnavailable,
        desiredMode: "whatsapp",
        effectiveMode: "unavailable",
        whatsapp: whatsappUnavailable,
      },
      {
        chat: available,
        desiredMode: "both",
        effectiveMode: "both",
        whatsapp: available,
      },
      {
        chat: available,
        desiredMode: "both",
        effectiveMode: "ewatrade_chat",
        whatsapp: whatsappUnavailable,
      },
      {
        chat: chatUnavailable,
        desiredMode: "both",
        effectiveMode: "whatsapp",
        whatsapp: available,
      },
      {
        chat: chatUnavailable,
        desiredMode: "both",
        effectiveMode: "unavailable",
        whatsapp: whatsappUnavailable,
      },
    ]

    for (const [index, current] of cases.entries()) {
      const projection = deriveStoreConversationChannelMode({
        chat: current.chat,
        desiredMode: current.desiredMode,
        revision: index,
        whatsapp: current.whatsapp,
      })

      expect(projection.effectiveMode).toBe(current.effectiveMode)
      expect(projection.composerEnabled).toBe(
        current.effectiveMode === "ewatrade_chat" ||
          current.effectiveMode === "both",
      )
      expect(projection.whatsappAction).toBe(
        current.effectiveMode === "both"
          ? "reach_store_faster_on_whatsapp"
          : current.effectiveMode === "whatsapp"
            ? "continue_on_whatsapp"
            : null,
      )
      expect(projection.historyReadable).toBe(true)
    }
  })

  test("keeps Chat-only free of WhatsApp actions", () => {
    expect(
      deriveStoreConversationChannelMode({
        chat: available,
        desiredMode: "ewatrade_chat",
        revision: 1,
        whatsapp: available,
      }),
    ).toMatchObject({
      composerEnabled: true,
      effectiveMode: "ewatrade_chat",
      historyReadable: true,
      whatsappAction: null,
    })
  })

  test("makes WhatsApp primary when it is the only effective channel", () => {
    expect(
      deriveStoreConversationChannelMode({
        chat: chatUnavailable,
        desiredMode: "both",
        revision: 2,
        whatsapp: available,
      }),
    ).toMatchObject({
      composerEnabled: false,
      effectiveMode: "whatsapp",
      whatsappAction: "continue_on_whatsapp",
    })
  })

  test("keeps Chat primary and WhatsApp secondary in Both mode", () => {
    expect(
      deriveStoreConversationChannelMode({
        chat: available,
        desiredMode: "both",
        revision: 3,
        whatsapp: available,
      }),
    ).toMatchObject({
      composerEnabled: true,
      effectiveMode: "both",
      whatsappAction: "reach_store_faster_on_whatsapp",
    })
  })

  test("fails closed without hiding history when neither channel is ready", () => {
    expect(
      deriveStoreConversationChannelMode({
        chat: chatUnavailable,
        desiredMode: "both",
        revision: 4,
        whatsapp: whatsappUnavailable,
      }),
    ).toMatchObject({
      composerEnabled: false,
      effectiveMode: "unavailable",
      historyReadable: true,
      whatsappAction: null,
    })
  })
})
