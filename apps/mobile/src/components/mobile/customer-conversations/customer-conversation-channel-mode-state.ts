import { projectStoreConversationWhatsAppAction } from "@ewatrade/service-commerce"

export function resolveCustomerConversationChannelModeState(input: {
  opening: boolean
  whatsappAction:
    | "continue_on_whatsapp"
    | "reach_store_faster_on_whatsapp"
    | null
}) {
  if (!input.whatsappAction) return null
  const presentation = projectStoreConversationWhatsAppAction({
    action: input.whatsappAction,
    opening: input.opening,
  })
  return {
    ...presentation,
    accessibilityHint: "Opens the Store's current verified WhatsApp route",
    badge: presentation.primary ? "WhatsApp only" : "Optional faster reply",
    detail: presentation.primary
      ? "Your ẸwáTrade history stays here. Continue securely with the Store on its current verified route."
      : "Your ẸwáTrade chat and draft stay here. We'll prepare a private one-time handoff to the Store's current verified route.",
    showHistoryContext: presentation.primary,
    title: presentation.primary
      ? "New messages use WhatsApp"
      : "Continue on WhatsApp when you choose",
  }
}

export function resolveCustomerConversationDisabledComposerLabel(input: {
  composerEnabled: boolean
  whatsappAction:
    | "continue_on_whatsapp"
    | "reach_store_faster_on_whatsapp"
    | null
}) {
  if (input.composerEnabled) return null
  return input.whatsappAction === "continue_on_whatsapp"
    ? "Continue on WhatsApp above"
    : "Messaging is unavailable"
}
