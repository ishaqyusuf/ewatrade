import { prisma } from "@ewatrade/db/client"
import { listServiceCommerceBookingReminderScopes } from "@ewatrade/db/queries"
import { logger, schedules, task } from "@trigger.dev/sdk/v3"

import { serviceCommerceBookingReminders } from "./service-commerce-booking-reminders"

const PAGE_SIZE = 50
const MAX_PAGES_PER_RUN = 4

type ReminderScope = {
  actorUserId: string
  storeId: string
  tenantId: string
}

type Dependencies = {
  enqueue(scope: ReminderScope): Promise<unknown>
  list(input: {
    afterProfileId?: string
    limit: number
  }): Promise<{ nextProfileId: string | null; scopes: ReminderScope[] }>
}

type ScheduleCursor = { afterProfileId?: string }

function defaultDependencies(): Dependencies {
  return {
    enqueue: (scope) => serviceCommerceBookingReminders.trigger(scope),
    list: (input) => listServiceCommerceBookingReminderScopes(prisma, input),
  }
}

/**
 * Bounded fan-out coordinator. It owns no booking queries: the repository
 * resolves active Store scopes and the scoped child task reauthorizes them.
 */
export async function runServiceCommerceBookingReminderSchedule(
  dependencies: Dependencies = defaultDependencies(),
  cursor: ScheduleCursor = {},
) {
  let afterProfileId = cursor.afterProfileId
  let nextProfileId: string | null = null
  let pages = 0
  let queued = 0

  while (pages < MAX_PAGES_PER_RUN) {
    const page = await dependencies.list({ afterProfileId, limit: PAGE_SIZE })
    pages += 1
    await Promise.all(page.scopes.map((scope) => dependencies.enqueue(scope)))
    queued += page.scopes.length
    nextProfileId = page.nextProfileId
    if (!page.nextProfileId) break
    afterProfileId = page.nextProfileId
  }

  return { nextProfileId, pages, queued }
}

async function runPageChain(cursor: ScheduleCursor = {}) {
  const result = await runServiceCommerceBookingReminderSchedule(
    defaultDependencies(),
    cursor,
  )
  if (result.nextProfileId) {
    await serviceCommerceBookingReminderScheduleContinuation.trigger({
      afterProfileId: result.nextProfileId,
    })
  }
  return result
}

export const serviceCommerceBookingReminderScheduleContinuation = task({
  id: "service-commerce.booking-reminder-schedule-continuation",
  maxDuration: 120,
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 3 },
  run: async (cursor: ScheduleCursor) => {
    const result = await runPageChain(cursor)
    logger.info(
      "Continued scoped Service Commerce booking reminder work",
      result,
    )
  },
})

export const serviceCommerceBookingReminderSchedule = schedules.task({
  cron: "*/5 * * * *",
  id: "service-commerce.booking-reminder-schedule",
  maxDuration: 120,
  run: async () => {
    const result = await runPageChain()
    logger.info("Queued scoped Service Commerce booking reminder work", result)
  },
})
