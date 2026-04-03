import type { LeadCaptureType } from "@ewatrade/db"

import {
  notificationDispatchHandler,
  type NotificationDispatchPayload
} from "./handlers/notification-dispatch"
import { triggerJob } from "./trigger"

export const jobIds = {
  notificationDispatch: "notifications.dispatch"
} as const

export type MarketingLeadNotificationInput = {
  companyName?: string | null
  email: string
  fullName: string
  id: string
  message?: string | null
  phone?: string | null
  roleTitle?: string | null
  type: LeadCaptureType
}

export async function enqueueMarketingLeadNotification(
  input: MarketingLeadNotificationInput
) {
  const type =
    input.type === "EARLY_ACCESS"
      ? "marketing_early_access_requested"
      : "marketing_waitlist_joined"

  const payload: NotificationDispatchPayload = {
    payload: {
      companyName: input.companyName ?? null,
      email: input.email,
      fullName: input.fullName,
      id: input.id,
      message: input.message ?? null,
      phone: input.phone ?? null,
      roleTitle: input.roleTitle ?? null
    },
    type
  }

  await triggerJob(jobIds.notificationDispatch, notificationDispatchHandler, payload)
}

export { runInBackground, runWithRetry } from "./queue"
export { isTriggerConfigured, triggerJob } from "./trigger"
export { notificationDispatchHandler }
export type { NotificationDispatchPayload }
