import { logger, task } from "@trigger.dev/sdk/v3"

import {
  type StoreConversationWhatsAppBridgePromptPayload,
  runStoreConversationWhatsAppBridgePrompt,
} from "../handlers/store-conversation-whatsapp-bridge-prompt"

export const storeConversationWhatsAppBridgePrompt = task({
  id: "store-conversation.whatsapp-bridge-prompt",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: StoreConversationWhatsAppBridgePromptPayload) => {
    const result = await runStoreConversationWhatsAppBridgePrompt(payload)
    logger.info("Processed Store Conversation WhatsApp bridge prompt", {
      sent: Boolean(result?.sent),
    })
    return result
  },
})
