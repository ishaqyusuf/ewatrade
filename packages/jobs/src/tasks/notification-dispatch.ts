import { logger, task } from "@trigger.dev/sdk/v3"

import {
  type NotificationDispatchPayload,
  notificationDispatchHandler,
} from "../handlers/notification-dispatch"

export const notificationDispatch = task({
  id: "notifications.dispatch",
  maxDuration: 60,
  queue: {
    concurrencyLimit: 5,
  },
  run: async (input: NotificationDispatchPayload) => {
    await notificationDispatchHandler(input, 1)

    logger.info("Processed notification dispatch", {
      type: input.type,
    })
  },
})
