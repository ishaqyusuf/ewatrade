import { task } from "@trigger.dev/sdk/v3"

import {
  type StoreConversationPrivacyRequestPayload,
  storeConversationPrivacyRequestHandler,
} from "../handlers/store-conversation-privacy-request"

export const storeConversationPrivacyRequest = task({
  id: "store-conversation.privacy-request",
  maxDuration: 300,
  queue: { concurrencyLimit: 3 },
  run: async (input: StoreConversationPrivacyRequestPayload) => {
    await storeConversationPrivacyRequestHandler(input)
  },
})
