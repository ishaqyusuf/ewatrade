import { describe, expect, test } from "bun:test"

import { deriveStoreConversationChannelReadiness } from "./store-conversation-channel-projection"

const readyFacts = {
  eligibleAttendant: true,
  pharmacyConfigured: false,
  pharmacyProfessionalReady: false,
  pharmacyWebPolicyAllowed: false,
  pharmacyWhatsAppPolicyAllowed: false,
  profileReady: true,
  serviceWebPolicyAllowed: true,
  serviceWhatsAppPolicyAllowed: true,
  webEnabled: true,
  whatsappBindingCount: 1,
  whatsappConnectionReady: true,
  whatsappEnabled: true,
} as const

describe("Store Conversation effective channel projection", () => {
  test("derives all desired modes without client-side readiness guesses", () => {
    expect(
      deriveStoreConversationChannelReadiness({
        availability: { available: true },
        desiredMode: "ewatrade_chat",
        facts: readyFacts,
        revision: 1,
      }),
    ).toMatchObject({
      composerEnabled: true,
      effectiveMode: "ewatrade_chat",
      whatsappAction: null,
    })
    expect(
      deriveStoreConversationChannelReadiness({
        availability: { available: true },
        desiredMode: "whatsapp",
        facts: readyFacts,
        revision: 2,
      }),
    ).toMatchObject({
      composerEnabled: false,
      effectiveMode: "whatsapp",
      whatsappAction: "continue_on_whatsapp",
    })
    expect(
      deriveStoreConversationChannelReadiness({
        availability: { available: true },
        desiredMode: "both",
        facts: readyFacts,
        revision: 3,
      }),
    ).toMatchObject({
      composerEnabled: true,
      effectiveMode: "both",
      whatsappAction: "reach_store_faster_on_whatsapp",
    })
  })

  test("keeps history readable when pause or attendant loss disables Chat", () => {
    expect(
      deriveStoreConversationChannelReadiness({
        availability: { available: false },
        desiredMode: "both",
        facts: { ...readyFacts, eligibleAttendant: false },
        revision: 4,
      }),
    ).toMatchObject({
      chat: { available: false, blockers: ["chat_unavailable"] },
      composerEnabled: false,
      effectiveMode: "unavailable",
      historyReadable: true,
      whatsapp: {
        available: false,
        blockers: ["whatsapp_unavailable"],
      },
    })
  })

  test("fails closed for provider rotation and ambiguous routing", () => {
    const degraded = deriveStoreConversationChannelReadiness({
      availability: { available: true },
      desiredMode: "whatsapp",
      facts: {
        ...readyFacts,
        whatsappBindingCount: 2,
        whatsappConnectionReady: false,
      },
      revision: 5,
    })
    expect(degraded.effectiveMode).toBe("unavailable")
    expect(degraded.whatsapp.blockers).toEqual(["whatsapp_routing_unavailable"])

    expect(
      deriveStoreConversationChannelReadiness({
        availability: { available: true },
        desiredMode: "whatsapp",
        facts: { ...readyFacts, whatsappConnectionReady: false },
        revision: 6,
      }).whatsapp.blockers,
    ).toEqual(["whatsapp_provider_unavailable"])
  })

  test("keeps Nigeria Pharmacy WhatsApp policy denial independent of technical readiness", () => {
    const projection = deriveStoreConversationChannelReadiness({
      availability: { available: true },
      desiredMode: "both",
      facts: {
        ...readyFacts,
        pharmacyConfigured: true,
        pharmacyProfessionalReady: true,
        pharmacyWebPolicyAllowed: true,
        pharmacyWhatsAppPolicyAllowed: false,
      },
      revision: 7,
    })

    expect(projection).toMatchObject({
      composerEnabled: true,
      effectiveMode: "ewatrade_chat",
      whatsapp: {
        available: false,
        blockers: ["whatsapp_policy_unavailable"],
      },
      whatsappAction: null,
    })
  })
})
