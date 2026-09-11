import { logger, task } from "@trigger.dev/sdk/v3"

import {
  type StoreConversationWhatsAppCandidatePromptPayload,
  runStoreConversationWhatsAppCandidatePrompt,
} from "../handlers/store-conversation-whatsapp-candidate-prompt"

export const storeConversationWhatsAppCandidatePrompt = task({
  id: "store-conversation.whatsapp-candidate-prompt",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: StoreConversationWhatsAppCandidatePromptPayload) => {
    const result = await runStoreConversationWhatsAppCandidatePrompt(payload)
    logger.info("Processed Store Conversation WhatsApp candidate prompt", {
      sent: Boolean(result?.sent),
    })
    return result
  },
})
