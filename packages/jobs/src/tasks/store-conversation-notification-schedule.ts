import { prisma } from "@ewatrade/db/client"
import {
  listDueStoreConversationNotificationIntents,
  listDueStoreConversationNotificationVerifications,
  listWaitingStoreConversationReopeningIntents,
  releaseStoreConversationReopeningIntent,
} from "@ewatrade/db/queries"
import { logger, schedules } from "@trigger.dev/sdk/v3"

import { storeConversationNotificationDispatch } from "./store-conversation-notification-dispatch"
import { storeConversationNotificationVerification } from "./store-conversation-notification-verification"

const SCHEDULE_LIMIT = 100

type NotificationIdentifier = {
  intentId: string
  storeId: string
  tenantId: string
}

type VerificationIdentifier = {
  storeId: string
  tenantId: string
  verificationId: string
}

type Dependencies = {
  enqueueNotification(input: NotificationIdentifier): Promise<unknown>
  enqueueVerification(input: VerificationIdentifier): Promise<unknown>
  listDueNotifications(input: {
    limit: number
    now: Date
  }): Promise<NotificationIdentifier[]>
  listDueVerifications(input: {
    limit: number
    now: Date
  }): Promise<VerificationIdentifier[]>
  listWaitingReopenings(input: {
    limit: number
  }): Promise<NotificationIdentifier[]>
  releaseReopening(
    input: NotificationIdentifier & { now: Date },
  ): Promise<NotificationIdentifier | null>
}

function defaultDependencies(): Dependencies {
  return {
    enqueueNotification: (input) =>
      storeConversationNotificationDispatch.trigger(input),
    enqueueVerification: (input) =>
      storeConversationNotificationVerification.trigger(input),
    listDueNotifications: (input) =>
      listDueStoreConversationNotificationIntents(prisma, input),
    listDueVerifications: (input) =>
      listDueStoreConversationNotificationVerifications(prisma, input),
    listWaitingReopenings: (input) =>
      listWaitingStoreConversationReopeningIntents(prisma, input),
    releaseReopening: async (input) => {
      const released = await releaseStoreConversationReopeningIntent(
        prisma,
        input,
      )
      return released
        ? {
            intentId: released.intentId,
            storeId: released.storeId,
            tenantId: released.tenantId,
          }
        : null
    },
  }
}

export async function runStoreConversationNotificationSchedule(
  dependencies: Dependencies = defaultDependencies(),
  now = new Date(),
) {
  const [dueNotifications, dueVerifications, waitingReopenings] =
    await Promise.all([
      dependencies.listDueNotifications({ limit: SCHEDULE_LIMIT, now }),
      dependencies.listDueVerifications({ limit: SCHEDULE_LIMIT, now }),
      dependencies.listWaitingReopenings({ limit: SCHEDULE_LIMIT }),
    ])
  const releasedReopenings = (
    await Promise.all(
      waitingReopenings.map((intent) =>
        dependencies.releaseReopening({ ...intent, now }),
      ),
    )
  ).filter((intent): intent is NotificationIdentifier => Boolean(intent))
  await Promise.all([
    ...dueNotifications.map((intent) =>
      dependencies.enqueueNotification(intent),
    ),
    ...releasedReopenings.map((intent) =>
      dependencies.enqueueNotification(intent),
    ),
    ...dueVerifications.map((verification) =>
      dependencies.enqueueVerification(verification),
    ),
  ])
  return {
    notificationsQueued: dueNotifications.length + releasedReopenings.length,
    reopeningsReleased: releasedReopenings.length,
    verificationsQueued: dueVerifications.length,
  }
}

export const storeConversationNotificationSchedule = schedules.task({
  cron: "* * * * *",
  id: "store-conversation.notification-schedule",
  maxDuration: 120,
  run: async () => {
    const result = await runStoreConversationNotificationSchedule()
    logger.info("Queued due Store Conversation notifications", result)
  },
})
