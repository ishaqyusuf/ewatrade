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
  type ServiceCommerceBookingNotificationDispatchPayload,
  serviceCommerceBookingNotificationDispatchHandler,
} from "./handlers/service-commerce-booking-notification-dispatch"
import {
  type ServiceCommerceBookingRemindersPayload,
  serviceCommerceBookingRemindersHandler,
} from "./handlers/service-commerce-booking-reminders"
import {
  type ServiceCommerceCustomerNotificationDispatchPayload,
  serviceCommerceCustomerNotificationDispatchHandler,
} from "./handlers/service-commerce-customer-notification-dispatch"
import {
  type ServiceCommerceMediaIngestPayload,
  serviceCommerceMediaIngestHandler,
} from "./handlers/service-commerce-media-ingest"
import {
  type ServiceCommerceMediaRetentionPayload,
  serviceCommerceMediaRetentionHandler,
} from "./handlers/service-commerce-media-retention"
import {
  type ServiceCommerceMediaSafetyPayload,
  serviceCommerceMediaSafetyHandler,
} from "./handlers/service-commerce-media-safety"
import {
  type ServiceCommerceWhatsAppInboundPayload,
  serviceCommerceWhatsAppInboundHandler,
} from "./handlers/service-commerce-whatsapp-inbound"
import {
  type ServiceNotificationDispatchPayload,
  serviceNotificationDispatchHandler,
} from "./handlers/service-notification-dispatch"
import {
  type StoreConversationNotificationDispatchPayload,
  storeConversationNotificationDispatchHandler,
} from "./handlers/store-conversation-notification-dispatch"
import {
  type StoreConversationNotificationVerificationPayload,
  storeConversationNotificationVerificationHandler,
} from "./handlers/store-conversation-notification-verification"
import {
  type StoreConversationPrivacyRequestPayload,
  storeConversationPrivacyRequestHandler,
} from "./handlers/store-conversation-privacy-request"
import {
  type StoreConversationWhatsAppBridgePromptPayload,
  storeConversationWhatsAppBridgePromptHandler,
} from "./handlers/store-conversation-whatsapp-bridge-prompt"
import {
  type StoreConversationWhatsAppCandidatePromptPayload,
  storeConversationWhatsAppCandidatePromptHandler,
} from "./handlers/store-conversation-whatsapp-candidate-prompt"
import {
  type StoreConversationWhatsAppOutboundPayload,
  storeConversationWhatsAppOutboundHandler,
} from "./handlers/store-conversation-whatsapp-outbound"
import {
  type StoreConversationWhatsAppRecoveryPayload,
  storeConversationWhatsAppRecoveryHandler,
} from "./handlers/store-conversation-whatsapp-recovery"
import {
  type WhatsAppConnectionTestPayload,
  whatsappConnectionTestHandler,
} from "./handlers/whatsapp-connection-test"
import { triggerJob, triggerJobAt } from "./trigger"

export const jobIds = {
  qaPurge: "platform.qa.purge",
  notificationDispatch: "notifications.dispatch",
  serviceNotificationDispatch: "services.notification.dispatch",
  storeConversationNotificationDispatch:
    "store-conversation.notification-dispatch",
  storeConversationNotificationVerification:
    "store-conversation.notification-verification",
  storeConversationPrivacyRequest: "store-conversation.privacy-request",
  storeConversationWhatsAppBridgePrompt:
    "store-conversation.whatsapp-bridge-prompt",
  storeConversationWhatsAppCandidatePrompt:
    "store-conversation.whatsapp-candidate-prompt",
  storeConversationWhatsAppOutbound: "store-conversation.whatsapp-outbound",
  storeConversationWhatsAppRecovery: "store-conversation.whatsapp-recovery",
  serviceCommerceMediaIngest: "service-commerce.media-ingest",
  serviceCommerceBookingNotificationDispatch:
    "service-commerce.booking-notification-dispatch",
  serviceCommerceCustomerNotificationDispatch:
    "service-commerce.customer-notification-dispatch",
  serviceCommerceCustomerNotificationSchedule:
    "service-commerce.customer-notification-schedule",
  serviceCommerceBookingReminders: "service-commerce.booking-reminders",
  serviceCommerceMediaSafety: "service-commerce.media-safety",
  serviceCommerceMediaRetention: "service-commerce.media-retention",
  serviceCommerceWhatsAppInbound: "service-commerce.whatsapp-inbound",
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

export async function enqueueStoreConversationNotificationDispatch(
  input: StoreConversationNotificationDispatchPayload,
  runAt = new Date(),
) {
  await triggerJobAt(
    jobIds.storeConversationNotificationDispatch,
    storeConversationNotificationDispatchHandler,
    input,
    runAt,
    { maxAttempts: 1 },
  )
}

export async function enqueueStoreConversationNotificationVerification(
  input: StoreConversationNotificationVerificationPayload,
) {
  await triggerJob(
    jobIds.storeConversationNotificationVerification,
    storeConversationNotificationVerificationHandler,
    input,
    { maxAttempts: 1 },
  )
}

export async function enqueueStoreConversationWhatsAppBridgePrompt(
  input: StoreConversationWhatsAppBridgePromptPayload,
) {
  await triggerJob(
    jobIds.storeConversationWhatsAppBridgePrompt,
    storeConversationWhatsAppBridgePromptHandler,
    input,
    { maxAttempts: 1 },
  )
}

export async function enqueueStoreConversationWhatsAppCandidatePrompt(
  input: StoreConversationWhatsAppCandidatePromptPayload,
) {
  await triggerJob(
    jobIds.storeConversationWhatsAppCandidatePrompt,
    storeConversationWhatsAppCandidatePromptHandler,
    input,
    { maxAttempts: 1 },
  )
}

export async function enqueueStoreConversationWhatsAppOutbound(
  input: StoreConversationWhatsAppOutboundPayload,
) {
  await triggerJob(
    jobIds.storeConversationWhatsAppOutbound,
    storeConversationWhatsAppOutboundHandler,
    input,
    { maxAttempts: 1 },
  )
}

export async function enqueueStoreConversationWhatsAppRecovery(
  input: StoreConversationWhatsAppRecoveryPayload,
) {
  await triggerJob(
    jobIds.storeConversationWhatsAppRecovery,
    storeConversationWhatsAppRecoveryHandler,
    input,
    { maxAttempts: 1 },
  )
}

export async function enqueueServiceCommerceMediaIngest(
  input: ServiceCommerceMediaIngestPayload,
) {
  await triggerJob(
    jobIds.serviceCommerceMediaIngest,
    serviceCommerceMediaIngestHandler,
    input,
    { maxAttempts: 4 },
  )
}

export async function enqueueServiceCommerceBookingNotificationDispatch(
  input: ServiceCommerceBookingNotificationDispatchPayload,
) {
  await triggerJob(
    jobIds.serviceCommerceBookingNotificationDispatch,
    serviceCommerceBookingNotificationDispatchHandler,
    input,
    { maxAttempts: 3 },
  )
}

export async function enqueueServiceCommerceCustomerNotificationDispatch(
  input: ServiceCommerceCustomerNotificationDispatchPayload,
) {
  await triggerJob(
    jobIds.serviceCommerceCustomerNotificationDispatch,
    serviceCommerceCustomerNotificationDispatchHandler,
    input,
    { maxAttempts: 3 },
  )
}

export async function enqueueServiceCommerceBookingReminders(
  input: ServiceCommerceBookingRemindersPayload,
) {
  await triggerJob(
    jobIds.serviceCommerceBookingReminders,
    serviceCommerceBookingRemindersHandler,
    input,
    { maxAttempts: 3 },
  )
}

export async function enqueueServiceCommerceMediaSafety(
  input: ServiceCommerceMediaSafetyPayload,
) {
  await triggerJob(
    jobIds.serviceCommerceMediaSafety,
    serviceCommerceMediaSafetyHandler,
    input,
    { maxAttempts: 4 },
  )
}

export async function enqueueServiceCommerceMediaRetention(
  input: ServiceCommerceMediaRetentionPayload,
) {
  await triggerJob(
    jobIds.serviceCommerceMediaRetention,
    serviceCommerceMediaRetentionHandler,
    input,
    { maxAttempts: 4 },
  )
}

export async function enqueueStoreConversationPrivacyRequest(
  privacyRequestId: string,
) {
  const payload: StoreConversationPrivacyRequestPayload = { privacyRequestId }
  await triggerJob(
    jobIds.storeConversationPrivacyRequest,
    storeConversationPrivacyRequestHandler,
    payload,
    { maxAttempts: 4 },
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

export async function enqueueServiceCommerceWhatsAppInbound(
  inboundEventId: string,
) {
  const payload: ServiceCommerceWhatsAppInboundPayload = { inboundEventId }
  await triggerJob(
    jobIds.serviceCommerceWhatsAppInbound,
    serviceCommerceWhatsAppInboundHandler,
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
export { isTriggerConfigured, triggerJob, triggerJobAt } from "./trigger"
export { notificationDispatchHandler }
export { serviceNotificationDispatchHandler }
export {
  storeConversationNotificationDispatchHandler,
  storeConversationNotificationVerificationHandler,
  storeConversationPrivacyRequestHandler,
  storeConversationWhatsAppBridgePromptHandler,
  storeConversationWhatsAppCandidatePromptHandler,
  storeConversationWhatsAppOutboundHandler,
  storeConversationWhatsAppRecoveryHandler,
}
export {
  serviceCommerceBookingNotificationDispatchHandler,
  serviceCommerceBookingRemindersHandler,
  serviceCommerceCustomerNotificationDispatchHandler,
  serviceCommerceMediaIngestHandler,
  serviceCommerceMediaRetentionHandler,
  serviceCommerceMediaSafetyHandler,
}
export { prescriptionTranscriptionHandler }
export { prescriptionMediaSafetyHandler }
export { prescriptionWhatsAppInboundHandler }
export { serviceCommerceWhatsAppInboundHandler }
export { prescriptionCommunicationDispatchHandler }
export { whatsappConnectionTestHandler }
export { prescriptionPrivacyRequestHandler }
export { domainConnectionVerificationHandler, domainRegistrationHandler }
export { domainReconciliationHandler }
export { commercialOrderRemindersHandler }
export { qaPurgeHandler } from "./handlers/qa-purge"
export { customerMessagingProviderStatus }
export type { NotificationDispatchPayload, ServiceNotificationDispatchPayload }
export type {
  StoreConversationNotificationDispatchPayload,
  StoreConversationNotificationVerificationPayload,
}
export type {
  ServiceCommerceBookingNotificationDispatchPayload,
  ServiceCommerceBookingRemindersPayload,
  ServiceCommerceCustomerNotificationDispatchPayload,
  ServiceCommerceMediaIngestPayload,
  ServiceCommerceMediaRetentionPayload,
  ServiceCommerceMediaSafetyPayload,
}
export type { PrescriptionTranscriptionPayload }
export type { PrescriptionMediaSafetyPayload }
export type { PrescriptionWhatsAppInboundPayload }
export type { ServiceCommerceWhatsAppInboundPayload }
export type { PrescriptionCommunicationDispatchPayload }
export type { WhatsAppConnectionTestPayload }
export type { PrescriptionPrivacyRequestPayload }
export type {
  DomainConnectionVerificationPayload,
  DomainReconciliationPayload,
  DomainRegistrationPayload,
}
