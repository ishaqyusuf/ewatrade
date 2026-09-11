import { logger, task } from "@trigger.dev/sdk/v3"

import {
  type StoreConversationWhatsAppOutboundPayload,
  runStoreConversationWhatsAppOutbound,
} from "../handlers/store-conversation-whatsapp-outbound"

export const storeConversationWhatsAppOutbound = task({
  id: "store-conversation.whatsapp-outbound",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: StoreConversationWhatsAppOutboundPayload) => {
    const result = await runStoreConversationWhatsAppOutbound(payload)
    logger.info("Processed Store Conversation WhatsApp outbound reply", {
      sent: Boolean(result?.sent),
    })
    return result
  },
})
