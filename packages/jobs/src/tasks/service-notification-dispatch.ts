import { prisma } from "@ewatrade/db/client"
import { listDueServiceNotificationIntentIds } from "@ewatrade/db/queries"
import { logger, schedules, task } from "@trigger.dev/sdk/v3"

import {
  type ServiceNotificationDispatchPayload,
  serviceNotificationDispatchHandler,
} from "../handlers/service-notification-dispatch"

export const serviceNotificationDispatch = task({
  id: "services.notification.dispatch",
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (input: ServiceNotificationDispatchPayload) => {
    await serviceNotificationDispatchHandler(input, 1)
  },
})

export const serviceNotificationSchedule = schedules.task({
  cron: "*/5 * * * *",
  id: "services.notification.schedule",
  maxDuration: 120,
  run: async () => {
    const intentIds = await listDueServiceNotificationIntentIds(prisma, {
      limit: 200,
    })
    for (const intentId of intentIds) {
      await serviceNotificationDispatch.trigger({ intentId })
    }
    logger.info("Queued due Service notifications", {
      count: intentIds.length,
    })
  },
})
