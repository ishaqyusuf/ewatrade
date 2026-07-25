import type { LeadCaptureType } from "@ewatrade/db"
import type { RetailOpsStaffInvitedPayload } from "@ewatrade/notifications"
import { customerMessagingProviderStatus } from "@ewatrade/notifications/services/customer-messaging-service"

import {
  type DomainConnectionVerificationPayload,
  domainConnectionVerificationHandler,
} from "./handlers/domain-connection-verification"
import {
  type DomainReconciliationPayload,
  domainReconciliationHandler,
} from "./handlers/domain-reconciliation"
import {
  type DomainRegistrationPayload,
  domainRegistrationHandler,
} from "./handlers/domain-registration"
import {
  type NotificationDispatchPayload,
  notificationDispatchHandler,
} from "./handlers/notification-dispatch"
import {
  type ServiceNotificationDispatchPayload,
  serviceNotificationDispatchHandler,
} from "./handlers/service-notification-dispatch"
import { triggerJob } from "./trigger"

export const jobIds = {
  notificationDispatch: "notifications.dispatch",
  serviceNotificationDispatch: "services.notification.dispatch",
  domainRegistration: "domains.registration",
  domainConnectionVerification: "domains.connection.verify",
  domainReconciliation: "domains.reconcile",
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

export async function enqueueServiceNotificationIntent(intentId: string) {
  const payload: ServiceNotificationDispatchPayload = { intentId }
  await triggerJob(
    jobIds.serviceNotificationDispatch,
    serviceNotificationDispatchHandler,
    payload,
  )
}

export async function enqueueDomainRegistration(
  input: DomainRegistrationPayload,
) {
  await triggerJob(
    jobIds.domainRegistration,
    domainRegistrationHandler,
    input,
    { maxAttempts: 3 },
  )
}

export async function enqueueDomainConnectionVerification(
  input: DomainConnectionVerificationPayload,
) {
  await triggerJob(
    jobIds.domainConnectionVerification,
    domainConnectionVerificationHandler,
    input,
    { maxAttempts: 8 },
  )
}

export { runInBackground, runWithRetry } from "./queue"
export { isTriggerConfigured, triggerJob } from "./trigger"
export { notificationDispatchHandler }
export { serviceNotificationDispatchHandler }
export { domainConnectionVerificationHandler, domainRegistrationHandler }
export { domainReconciliationHandler }
export { customerMessagingProviderStatus }
export type { NotificationDispatchPayload, ServiceNotificationDispatchPayload }
export type {
  DomainConnectionVerificationPayload,
  DomainReconciliationPayload,
  DomainRegistrationPayload,
}
