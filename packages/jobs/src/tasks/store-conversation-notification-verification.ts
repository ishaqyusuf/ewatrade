import { logger, task } from "@trigger.dev/sdk/v3"

import {
  type StoreConversationNotificationVerificationPayload,
  runStoreConversationNotificationVerification,
} from "../handlers/store-conversation-notification-verification"

export const storeConversationNotificationVerification = task({
  id: "store-conversation.notification-verification",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: StoreConversationNotificationVerificationPayload) => {
    const result = await runStoreConversationNotificationVerification(payload)
    logger.info("Processed Store Conversation notification verification", {
      sent: Boolean(result?.sent),
      storeId: payload.storeId,
      tenantId: payload.tenantId,
      verificationId: payload.verificationId,
    })
    return result
  },
})
