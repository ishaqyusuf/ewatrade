import { logger, task } from "@trigger.dev/sdk/v3"

import {
  type StoreConversationWhatsAppRecoveryPayload,
  runStoreConversationWhatsAppRecovery,
} from "../handlers/store-conversation-whatsapp-recovery"

export const storeConversationWhatsAppRecovery = task({
  id: "store-conversation.whatsapp-recovery",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: StoreConversationWhatsAppRecoveryPayload) => {
    const result = await runStoreConversationWhatsAppRecovery(payload)
    logger.info("Processed Store Conversation WhatsApp recovery", {
      sent: Boolean(result?.sent),
    })
    return result
  },
})
