import { logger, task } from "@trigger.dev/sdk/v3"

import {
  type StoreConversationNotificationDispatchPayload,
  runStoreConversationNotificationDispatch,
} from "../handlers/store-conversation-notification-dispatch"

export const storeConversationNotificationDispatch = task({
  id: "store-conversation.notification-dispatch",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: StoreConversationNotificationDispatchPayload) => {
    const result = await runStoreConversationNotificationDispatch(payload)
    logger.info("Processed Store Conversation notification", {
      intentId: payload.intentId,
      sent: Boolean(result?.sent),
      storeId: payload.storeId,
      tenantId: payload.tenantId,
    })
    return result
  },
})
