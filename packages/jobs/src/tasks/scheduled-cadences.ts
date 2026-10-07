import { idempotencyKeys, logger, schedules } from "@trigger.dev/sdk/v3"
import { automaticJobCron } from "../schedule-policy"
import { accountPrivacyNoticeAlert } from "./account-privacy-notice-alert"
import { accountPrivacyVerificationExpiry } from "./account-privacy-verification-expiry"
import { catalogPhotoCleanup } from "./catalog-photo-cleanup"
import { catalogPhotoReviewRecovery } from "./catalog-photo-review"
import { commercialOrderReminders } from "./commercial-order-reminders"
import { domainReconciliation } from "./domains"
import { playRefundReviewAlert } from "./play-refund-review-alert"
import { prescriptionRetention } from "./prescription-retention"
import { serviceCommerceBookingReminderSchedule } from "./service-commerce-booking-reminder-schedule"
import { serviceCommerceCustomerNotificationSchedule } from "./service-commerce-customer-notification-schedule"
import { serviceNotificationSchedule } from "./service-notification-dispatch"
import { storeConversationCredentialExpiry } from "./store-conversation-credential-expiry"
import { storeConversationEscalations } from "./store-conversation-escalations"
import { storeConversationMediaSafetyRecovery } from "./store-conversation-media-safety-recovery"
import { storeConversationNotificationSchedule } from "./store-conversation-notification-schedule"
import { storeConversationWhatsAppBridgeSchedule } from "./store-conversation-whatsapp-bridge-schedule"
import { storeConversationWhatsAppRecoverySchedule } from "./store-conversation-whatsapp-recovery-schedule"

type CadenceTask = {
  id: string
  trigger: (
    payload: undefined,
    options: {
      idempotencyKey: Awaited<ReturnType<typeof idempotencyKeys.create>>
    },
  ) => Promise<unknown>
}

/**
 * Trigger.dev plans cap declared schedules, so periodic work shares one
 * schedule per cadence. Each task still runs as its own run with its own queue,
 * retries and limits; the cadence run only starts them.
 */
export const SCHEDULED_CADENCES = {
  "schedules.every-minute": {
    cron: "* * * * *",
    tasks: [
      catalogPhotoReviewRecovery,
      storeConversationEscalations,
      storeConversationNotificationSchedule,
      storeConversationWhatsAppBridgeSchedule,
      storeConversationWhatsAppRecoverySchedule,
    ],
  },
  "schedules.every-5-minutes": {
    cron: "*/5 * * * *",
    tasks: [
      catalogPhotoCleanup,
      serviceCommerceBookingReminderSchedule,
      serviceCommerceCustomerNotificationSchedule,
      serviceNotificationSchedule,
      storeConversationMediaSafetyRecovery,
    ],
  },
  "schedules.every-15-minutes": {
    cron: "*/15 * * * *",
    tasks: [
      accountPrivacyNoticeAlert,
      domainReconciliation,
      playRefundReviewAlert,
    ],
  },
  "schedules.hourly": {
    cron: "0 * * * *",
    tasks: [
      accountPrivacyVerificationExpiry,
      commercialOrderReminders,
      storeConversationCredentialExpiry,
    ],
  },
  "schedules.daily": {
    cron: "15 2 * * *",
    tasks: [prescriptionRetention],
  },
} as const satisfies Record<
  string,
  { cron: string; tasks: readonly CadenceTask[] }
>

/**
 * Starts every task for this tick. Keys are scoped to the cadence run, so a
 * retried cadence run never starts the same task twice for one tick.
 */
export async function startCadenceTasks(cadence: readonly CadenceTask[]) {
  const results = await Promise.allSettled(
    cadence.map(async (task) =>
      task.trigger(undefined, {
        idempotencyKey: await idempotencyKeys.create(task.id),
      }),
    ),
  )
  const failed = cadence.filter(
    (_, index) => results[index]?.status === "rejected",
  )
  if (failed.length > 0) {
    logger.error("Some scheduled tasks could not be started", {
      tasks: failed.map((task) => task.id),
    })
    throw new Error(
      `Could not start ${failed.length} scheduled task(s): ${failed.map((task) => task.id).join(", ")}`,
    )
  }
  return { started: cadence.map((task) => task.id) }
}

function cadenceSchedule(id: keyof typeof SCHEDULED_CADENCES) {
  const cadence = SCHEDULED_CADENCES[id]
  return schedules.task({
    id,
    cron: automaticJobCron(cadence.cron),
    maxDuration: 60,
    run: () => startCadenceTasks(cadence.tasks),
  })
}

export const everyMinuteSchedule = cadenceSchedule("schedules.every-minute")
export const everyFiveMinutesSchedule = cadenceSchedule(
  "schedules.every-5-minutes",
)
export const everyFifteenMinutesSchedule = cadenceSchedule(
  "schedules.every-15-minutes",
)
export const hourlySchedule = cadenceSchedule("schedules.hourly")
export const dailySchedule = cadenceSchedule("schedules.daily")
