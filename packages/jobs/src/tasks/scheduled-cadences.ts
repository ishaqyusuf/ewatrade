import { SETUP_ATTACHMENT_MAX_ATTEMPTS } from "@ewatrade/assistant/setup/attachment-processing"
import { isCatalogPhotoReviewConfigured } from "@ewatrade/catalog/photo-review-openai"
import { listAssistantAttachmentsToProcess } from "@ewatrade/db/assistant-attachments"
import { listCatalogPhotoReviewCandidates } from "@ewatrade/db/catalog-photo-review"
import { prisma } from "@ewatrade/db/client"
import { pendingProductAnalyticsEvents } from "@ewatrade/db/product-analytics"
import {
  isWebsiteDomainsLaunchApproved,
  purgeExpiredAccountPrivacyVerification,
} from "@ewatrade/db/queries"
import { idempotencyKeys, logger, schedules } from "@trigger.dev/sdk/v3"
import { isCommercialOrderDigestWindow } from "../handlers/commercial-order-reminder-digest"
import { automaticJobCron } from "../schedule-policy"
import { accountPrivacyNoticeAlert } from "./account-privacy-notice-alert"
import { accountPrivacyRetention } from "./account-privacy-retention"
import { assistantAttachmentProcessRecovery } from "./assistant-attachment-process"
import { assistantMaintenance } from "./assistant-maintenance"
import { catalogPhotoCleanup } from "./catalog-photo-cleanup"
import { catalogPhotoReviewRecovery } from "./catalog-photo-review"
import { commercialOrderReminders } from "./commercial-order-reminders"
import { domainReconciliation } from "./domains"
import { playRefundReviewAlert } from "./play-refund-review-alert"
import { prescriptionRetention } from "./prescription-retention"
import { productAnalyticsRecovery } from "./product-analytics"
import { runServiceCommerceBookingReminderPageChain } from "./service-commerce-booking-reminder-schedule"
import { runServiceCommerceCustomerNotificationSchedule } from "./service-commerce-customer-notification-schedule"
import { runServiceNotificationSchedule } from "./service-notification-dispatch"
import { runStaffInvitationNotificationSweep } from "./staff-invitation-notification-schedule"
import { runStoreConversationCredentialExpiry } from "./store-conversation-credential-expiry"
import { runStoreConversationEscalations } from "./store-conversation-escalations"
import { runStoreConversationMediaSafetySweep } from "./store-conversation-media-safety-recovery"
import { runStoreConversationNotificationSchedule } from "./store-conversation-notification-schedule"
import { runStoreConversationWhatsAppBridgeSchedule } from "./store-conversation-whatsapp-bridge-schedule"
import { runStoreConversationWhatsAppRecoverySchedule } from "./store-conversation-whatsapp-recovery-schedule"

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
 * A sweep runs inside the cadence run: it only queries and enqueues, so it
 * costs no run of its own when idle. A started task gets its own run (queue,
 * retries, longer duration) and is started only when `hasWork` allows it.
 */
export type CadenceStep =
  | { id: string; kind: "sweep"; run: () => Promise<unknown> }
  | {
      hasWork?: () => boolean | Promise<boolean>
      id: string
      kind: "task"
      task: CadenceTask
    }

function sweep(id: string, run: () => Promise<unknown>): CadenceStep {
  return { id, kind: "sweep", run }
}

function start(
  task: CadenceTask,
  hasWork?: () => boolean | Promise<boolean>,
): CadenceStep {
  return { hasWork, id: task.id, kind: "task", task }
}

const env = (key: string) => process.env[key] === "true"

async function anyTenantInOrderDigestWindow() {
  const zones = await prisma.tenant.findMany({
    distinct: ["timezone"],
    select: { timezone: true },
  })
  const now = new Date()
  return zones.some(({ timezone }) =>
    isCommercialOrderDigestWindow(now, timezone),
  )
}

/**
 * Trigger.dev bills every run, so idle ticks must stay at one run per
 * cadence. Sweeps are safety nets behind API-time dispatch: first sends are
 * immediate, retries and lost dispatches are picked up within the cadence.
 */
export const SCHEDULED_CADENCES = {
  "schedules.every-5-minutes": {
    cron: "*/5 * * * *",
    steps: [
      start(
        assistantAttachmentProcessRecovery,
        async () =>
          (
            await listAssistantAttachmentsToProcess(prisma, {
              limit: 1,
              maxAttempts: SETUP_ATTACHMENT_MAX_ATTEMPTS,
            })
          ).length > 0,
      ),
      sweep("service-commerce.booking-reminder-schedule", () =>
        runServiceCommerceBookingReminderPageChain(),
      ),
      sweep("service-commerce.customer-notification-schedule", () =>
        runServiceCommerceCustomerNotificationSchedule(),
      ),
      sweep("services.notification.schedule", runServiceNotificationSchedule),
      sweep(
        "staff.invitation.notification-schedule",
        runStaffInvitationNotificationSweep,
      ),
      sweep("store-conversation.notification-schedule", () =>
        runStoreConversationNotificationSchedule(),
      ),
      sweep("store-conversation.whatsapp-bridge-schedule", () =>
        runStoreConversationWhatsAppBridgeSchedule(),
      ),
      sweep("store-conversation.whatsapp-recovery-schedule", () =>
        runStoreConversationWhatsAppRecoverySchedule(),
      ),
      sweep(
        "store-conversations.media-safety-recovery",
        runStoreConversationMediaSafetySweep,
      ),
    ],
  },
  "schedules.every-15-minutes": {
    cron: "*/15 * * * *",
    steps: [
      start(
        catalogPhotoReviewRecovery,
        async () =>
          isCatalogPhotoReviewConfigured() &&
          (await listCatalogPhotoReviewCandidates(prisma)).length > 0,
      ),
      start(
        productAnalyticsRecovery,
        async () =>
          env("NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED") &&
          (await pendingProductAnalyticsEvents(prisma)).length > 0,
      ),
      sweep("store-conversations.escalations", () =>
        runStoreConversationEscalations(),
      ),
    ],
  },
  "schedules.hourly": {
    cron: "0 * * * *",
    steps: [
      start(accountPrivacyNoticeAlert, () =>
        env("ACCOUNT_PRIVACY_NOTICE_ALERTS_ENABLED"),
      ),
      start(assistantMaintenance),
      start(catalogPhotoCleanup, () => env("CATALOG_PHOTO_CLEANUP_ENABLED")),
      start(commercialOrderReminders, anyTenantInOrderDigestWindow),
      start(domainReconciliation, isWebsiteDomainsLaunchApproved),
      start(playRefundReviewAlert, () =>
        env("PLAY_REFUND_REVIEW_ALERTS_ENABLED"),
      ),
      sweep("store-conversation.credential-expiry", () =>
        runStoreConversationCredentialExpiry(),
      ),
    ],
  },
  "schedules.daily": {
    cron: "15 2 * * *",
    steps: [
      start(prescriptionRetention),
      start(accountPrivacyRetention),
      sweep("account-privacy.verification-expiry", () =>
        purgeExpiredAccountPrivacyVerification(prisma),
      ),
    ],
  },
} as const satisfies Record<
  string,
  { cron: string; steps: readonly CadenceStep[] }
>

async function shouldStart(step: Extract<CadenceStep, { kind: "task" }>) {
  if (!step.hasWork) return true
  try {
    return await step.hasWork()
  } catch (error) {
    // Fail open: the task reports its own failure with its own retries.
    logger.warn("Cadence work check failed; starting task", {
      error: error instanceof Error ? error.message : String(error),
      task: step.id,
    })
    return true
  }
}

async function runStep(step: CadenceStep) {
  if (step.kind === "sweep") {
    await step.run()
    return "swept" as const
  }
  if (!(await shouldStart(step))) return "idle" as const
  // Keys are scoped to the cadence run, so a retried cadence run never starts
  // the same task twice for one tick.
  await step.task.trigger(undefined, {
    idempotencyKey: await idempotencyKeys.create(step.task.id),
  })
  return "started" as const
}

/** Runs every step for this tick; one failing step never blocks the rest. */
export async function runCadenceSteps(steps: readonly CadenceStep[]) {
  const results = await Promise.allSettled(steps.map(runStep))
  const outcome = Object.fromEntries(
    steps.map((step, index) => {
      const result = results[index]
      return [step.id, result?.status === "fulfilled" ? result.value : "failed"]
    }),
  )
  const failed = steps.filter(
    (_, index) => results[index]?.status === "rejected",
  )
  if (failed.length > 0) {
    logger.error("Some scheduled steps failed", {
      errors: failed.map((step) => {
        const result = results[steps.indexOf(step)]
        return {
          error:
            result?.status === "rejected"
              ? String(result.reason?.message ?? result.reason)
              : null,
          step: step.id,
        }
      }),
    })
    throw new Error(
      `${failed.length} scheduled step(s) failed: ${failed.map((step) => step.id).join(", ")}`,
    )
  }
  return outcome
}

function cadenceSchedule(id: keyof typeof SCHEDULED_CADENCES) {
  const cadence = SCHEDULED_CADENCES[id]
  return schedules.task({
    id,
    cron: automaticJobCron(cadence.cron),
    maxDuration: 180,
    // The next tick is the retry; retrying would rerun every sweep.
    retry: { maxAttempts: 1 },
    run: () => runCadenceSteps(cadence.steps),
  })
}

export const everyFiveMinutesSchedule = cadenceSchedule(
  "schedules.every-5-minutes",
)
export const everyFifteenMinutesSchedule = cadenceSchedule(
  "schedules.every-15-minutes",
)
export const hourlySchedule = cadenceSchedule("schedules.hourly")
export const dailySchedule = cadenceSchedule("schedules.daily")
