import type { LeadCaptureType } from "@ewatrade/db"
import type {
  RetailOpsSharedLinkOrderRequestedPayload,
  RetailOpsStaffInvitedPayload,
} from "@ewatrade/notifications"

import {
  type NotificationDispatchPayload,
  notificationDispatchHandler,
} from "./handlers/notification-dispatch"
import { triggerJob } from "./trigger"

export const jobIds = {
  notificationDispatch: "notifications.dispatch",
} as const

const retailOpsSharedLinkNotificationRetryOptions = {
  baseDelayMs: 2_000,
  maxAttempts: 4,
} as const

export type MarketingLeadNotificationInput = {
  accessExpiresAt?: string | null
  accessUrl?: string | null
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
  input: MarketingLeadNotificationInput,
) {
  const type =
    input.type === "EARLY_ACCESS"
      ? "marketing_early_access_requested"
      : "marketing_waitlist_joined"

  const basePayload = {
    companyName: input.companyName ?? null,
    email: input.email,
    fullName: input.fullName,
    id: input.id,
    message: input.message ?? null,
    phone: input.phone ?? null,
    roleTitle: input.roleTitle ?? null,
  }

  const payload: NotificationDispatchPayload =
    type === "marketing_early_access_requested"
      ? {
          payload: {
            ...basePayload,
            accessExpiresAt: input.accessExpiresAt ?? null,
            accessUrl: input.accessUrl ?? null,
          },
          type,
        }
      : {
          payload: basePayload,
          type,
        }

  await triggerJob(
    jobIds.notificationDispatch,
    notificationDispatchHandler,
    payload,
  )
}

export async function enqueueRetailOpsSharedLinkOrderNotification(
  input: RetailOpsSharedLinkOrderRequestedPayload,
) {
  const payload: NotificationDispatchPayload = {
    delivery: retailOpsSharedLinkNotificationRetryOptions,
    payload: input,
    type: "retail_ops_shared_link_order_requested",
  }

  await triggerJob(
    jobIds.notificationDispatch,
    notificationDispatchHandler,
    payload,
    retailOpsSharedLinkNotificationRetryOptions,
  )
}

export async function enqueueRetailOpsStaffInviteNotification(
  input: RetailOpsStaffInvitedPayload,
) {
  const payload: NotificationDispatchPayload = {
    payload: input,
    type: "retail_ops_staff_invited",
  }

  await triggerJob(
    jobIds.notificationDispatch,
    notificationDispatchHandler,
    payload,
  )
}

export { runInBackground, runWithRetry } from "./queue"
export { isTriggerConfigured, triggerJob } from "./trigger"
export { notificationDispatchHandler }
export type { NotificationDispatchPayload }
