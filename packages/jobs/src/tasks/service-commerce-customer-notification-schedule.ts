import { prisma } from "@ewatrade/db/client"
import { listDueServiceCommerceCustomerNotificationIntents } from "@ewatrade/db/queries"
import { logger, schedules } from "@trigger.dev/sdk/v3"

import { serviceCommerceCustomerNotificationDispatch } from "./service-commerce-customer-notification-dispatch"

const SCHEDULE_LIMIT = 100

type NotificationIdentifier = {
  actorUserId: string
  intentId: string
  storeId: string
  tenantId: string
}

type Dependencies = {
  enqueue(input: NotificationIdentifier): Promise<unknown>
  list(input: { limit: number; now: Date }): Promise<NotificationIdentifier[]>
}

function defaultDependencies(): Dependencies {
  return {
    enqueue: (input) =>
      serviceCommerceCustomerNotificationDispatch.trigger(input),
    list: (input) =>
      listDueServiceCommerceCustomerNotificationIntents(prisma, input),
  }
}

export async function runServiceCommerceCustomerNotificationSchedule(
  dependencies: Dependencies = defaultDependencies(),
  now = new Date(),
) {
  const due = await dependencies.list({ limit: SCHEDULE_LIMIT, now })
  await Promise.all(due.map((intent) => dependencies.enqueue(intent)))
  return { queued: due.length }
}

export const serviceCommerceCustomerNotificationSchedule = schedules.task({
  cron: "*/5 * * * *",
  id: "service-commerce.customer-notification-schedule",
  maxDuration: 120,
  run: async () => {
    const result = await runServiceCommerceCustomerNotificationSchedule()
    logger.info("Queued due Service Commerce customer notifications", result)
  },
})
