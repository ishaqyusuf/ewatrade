import type {
  StoreConversationChannelModeProjection,
  StoreConversationChannelReadiness,
  StoreConversationDesiredMode,
  StoreConversationEffectiveMode,
} from "./schemas/store-conversation-channel-mode"

export function deriveStoreConversationChannelMode(input: {
  chat: StoreConversationChannelReadiness
  desiredMode: StoreConversationDesiredMode
  revision: number
  whatsapp: StoreConversationChannelReadiness
}): StoreConversationChannelModeProjection {
  const chatRequested = input.desiredMode !== "whatsapp"
  const whatsappRequested = input.desiredMode !== "ewatrade_chat"
  const chatAvailable = chatRequested && input.chat.available
  const whatsappAvailable = whatsappRequested && input.whatsapp.available
  let effectiveMode: StoreConversationEffectiveMode = "unavailable"
  if (chatAvailable && whatsappAvailable) effectiveMode = "both"
  else if (chatAvailable) effectiveMode = "ewatrade_chat"
  else if (whatsappAvailable) effectiveMode = "whatsapp"

  return {
    chat: input.chat,
    composerEnabled: chatAvailable,
    desiredMode: input.desiredMode,
    effectiveMode,
    historyReadable: true,
    revision: input.revision,
    whatsapp: input.whatsapp,
    whatsappAction: whatsappAvailable
      ? chatAvailable
        ? "reach_store_faster_on_whatsapp"
        : "continue_on_whatsapp"
      : null,
  }
}
