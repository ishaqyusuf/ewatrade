import type { LeadCaptureType } from "@ewatrade/db"
import type { RetailOpsStaffInvitedPayload } from "@ewatrade/notifications"
import { customerMessagingProviderStatus } from "@ewatrade/notifications/services/customer-messaging-service"

import { commercialOrderRemindersHandler } from "./handlers/commercial-order-reminders"
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
  type PrescriptionCommunicationDispatchPayload,
  prescriptionCommunicationDispatchHandler,
} from "./handlers/prescription-communication-dispatch"
import {
  type PrescriptionMediaSafetyPayload,
  prescriptionMediaSafetyHandler,
} from "./handlers/prescription-media-safety"
import {
  type PrescriptionPrivacyRequestPayload,
  prescriptionPrivacyRequestHandler,
} from "./handlers/prescription-privacy-request"
import {
  type PrescriptionTranscriptionPayload,
  prescriptionTranscriptionHandler,
} from "./handlers/prescription-transcription"
import {
  type PrescriptionWhatsAppInboundPayload,
  prescriptionWhatsAppInboundHandler,
} from "./handlers/prescription-whatsapp-inbound"
import {
  type ServiceNotificationDispatchPayload,
  serviceNotificationDispatchHandler,
} from "./handlers/service-notification-dispatch"
import {
  type WhatsAppConnectionTestPayload,
  whatsappConnectionTestHandler,
} from "./handlers/whatsapp-connection-test"
import { triggerJob } from "./trigger"

export const jobIds = {
  qaPurge: "platform.qa.purge",
  notificationDispatch: "notifications.dispatch",
  serviceNotificationDispatch: "services.notification.dispatch",
  domainRegistration: "domains.registration",
  domainConnectionVerification: "domains.connection.verify",
  domainReconciliation: "domains.reconcile",
  commercialOrderReminders: "orders.fulfillment-reminders",
  prescriptionTranscription: "prescriptions.transcription",
  prescriptionMediaSafety: "prescriptions.media-safety",
  prescriptionWhatsAppInbound: "prescriptions.whatsapp-inbound",
  prescriptionCommunicationDispatch: "prescriptions.communication-dispatch",
  whatsappConnectionTest: "communications.whatsapp-connection-test",
  prescriptionPrivacyRequest: "prescriptions.privacy-request",
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

export async function enqueuePrescriptionTranscription(
  transcriptionId: string,
) {
  const payload: PrescriptionTranscriptionPayload = { transcriptionId }
  await triggerJob(
    jobIds.prescriptionTranscription,
    prescriptionTranscriptionHandler,
    payload,
    { maxAttempts: 4 },
  )
}

export async function enqueuePrescriptionMediaSafety(requestId: string) {
  const payload: PrescriptionMediaSafetyPayload = { requestId }
  await triggerJob(
    jobIds.prescriptionMediaSafety,
    prescriptionMediaSafetyHandler,
    payload,
    { maxAttempts: 4 },
  )
}

export async function enqueuePrescriptionWhatsAppInbound(
  inboundEventId: string,
) {
  const payload: PrescriptionWhatsAppInboundPayload = { inboundEventId }
  await triggerJob(
    jobIds.prescriptionWhatsAppInbound,
    prescriptionWhatsAppInboundHandler,
    payload,
    { maxAttempts: 4 },
  )
}

export async function enqueuePrescriptionCommunicationDispatch(
  intentId: string,
) {
  const payload: PrescriptionCommunicationDispatchPayload = { intentId }
  await triggerJob(
    jobIds.prescriptionCommunicationDispatch,
    prescriptionCommunicationDispatchHandler,
    payload,
    { maxAttempts: 4 },
  )
}

export async function enqueueWhatsAppConnectionTest(
  input: WhatsAppConnectionTestPayload,
) {
  await triggerJob(
    jobIds.whatsappConnectionTest,
    whatsappConnectionTestHandler,
    input,
    { maxAttempts: 4 },
  )
}

export async function enqueuePrescriptionPrivacyRequest(
  input: PrescriptionPrivacyRequestPayload,
) {
  await triggerJob(
    jobIds.prescriptionPrivacyRequest,
    prescriptionPrivacyRequestHandler,
    input,
    { maxAttempts: 4 },
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
export { prescriptionTranscriptionHandler }
export { prescriptionMediaSafetyHandler }
export { prescriptionWhatsAppInboundHandler }
export { prescriptionCommunicationDispatchHandler }
export { whatsappConnectionTestHandler }
export { prescriptionPrivacyRequestHandler }
export { domainConnectionVerificationHandler, domainRegistrationHandler }
export { domainReconciliationHandler }
export { commercialOrderRemindersHandler }
export { qaPurgeHandler } from "./handlers/qa-purge"
export { customerMessagingProviderStatus }
export type { NotificationDispatchPayload, ServiceNotificationDispatchPayload }
export type { PrescriptionTranscriptionPayload }
export type { PrescriptionMediaSafetyPayload }
export type { PrescriptionWhatsAppInboundPayload }
export type { PrescriptionCommunicationDispatchPayload }
export type { WhatsAppConnectionTestPayload }
export type { PrescriptionPrivacyRequestPayload }
export type {
  DomainConnectionVerificationPayload,
  DomainReconciliationPayload,
  DomainRegistrationPayload,
}
