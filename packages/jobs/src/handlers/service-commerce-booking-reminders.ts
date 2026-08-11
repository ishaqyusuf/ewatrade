import { prisma } from "@ewatrade/db/client"
import { scheduleDueServiceCommerceBookingReminderIntents } from "@ewatrade/db/queries"

import { enqueueServiceCommerceBookingNotificationDispatch } from "../index"

/**
 * Scope is supplied by an authorized scheduling caller. The job does not scan
 * tenants or stores, and all reminder records are reloaded by the repository.
 */
export type ServiceCommerceBookingRemindersPayload = {
  actorUserId: string
  limit?: number
  storeId: string
  tenantId: string
}

type Dependencies = {
  enqueue(input: {
    actorUserId: string
    intentId: string
    storeId: string
    tenantId: string
  }): Promise<unknown>
  schedule(input: ServiceCommerceBookingRemindersPayload): Promise<{
    notificationDispatches: Array<{ actorUserId: string; intentId: string }>
  }>
}

function defaultDependencies(): Dependencies {
  return {
    enqueue: enqueueServiceCommerceBookingNotificationDispatch,
    schedule: (input) =>
      scheduleDueServiceCommerceBookingReminderIntents(prisma, input),
  }
}

export async function runServiceCommerceBookingReminders(
  payload: ServiceCommerceBookingRemindersPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const scheduled = await dependencies.schedule(payload)
  await Promise.all(
    scheduled.notificationDispatches.map((dispatch) =>
      dependencies.enqueue({
        actorUserId: dispatch.actorUserId,
        intentId: dispatch.intentId,
        storeId: payload.storeId,
        tenantId: payload.tenantId,
      }),
    ),
  )
  return { scheduled: scheduled.notificationDispatches.length }
}

export async function serviceCommerceBookingRemindersHandler(
  payload: ServiceCommerceBookingRemindersPayload,
) {
  await runServiceCommerceBookingReminders(payload)
}
