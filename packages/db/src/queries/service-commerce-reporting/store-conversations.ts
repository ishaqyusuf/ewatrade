import type { ServiceCommerceStoreConversationReport } from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../../generated/prisma/client"

type StoreConversationAggregateRow = {
  availabilityCoverageBlocks: bigint
  availabilityPaused: bigint
  availabilityPolicyBlocks: bigint
  availabilityProviderBlocks: bigint
  availabilityResumed: bigint
  availabilityScheduleUpdates: bigint
  channelBridgeConfirmed: bigint
  channelBridgeInitiated: bigint
  channelDesiredBothCurrent: bigint
  channelDesiredChatCurrent: bigint
  channelDesiredWhatsAppCurrent: bigint
  channelDirectContinued: bigint
  channelDirectStartedNew: bigint
  channelMobileMessages: bigint
  channelModeChanges: bigint
  channelWebMessages: bigint
  channelWhatsAppMessages: bigint
  lifecycleArchived: bigint
  lifecycleActiveCurrent: bigint
  lifecycleArchivedCurrent: bigint
  lifecycleConversationsStarted: bigint
  lifecycleCustomerMessages: bigint
  lifecycleFirstResponseAverageSeconds: number | null
  lifecycleFirstResponseKnown: bigint
  lifecycleFirstResponseUnknown: bigint
  lifecyclePrescriptionRequests: bigint
  lifecycleProductRequests: bigint
  lifecycleReactivated: bigint
  lifecycleRestrictedCurrent: bigint
  lifecycleServiceRequests: bigint
  lifecycleStoreReplies: bigint
  lifecycleUnreadAverageSeconds: number | null
  lifecycleUnreadKnown: bigint
  lifecycleUnreadUnknown: bigint
  notificationCancelled: bigint
  notificationCancelledByRead: bigint
  notificationCoalesced: bigint
  notificationDelivered: bigint
  notificationFailed: bigint
  notificationScheduled: bigint
  notificationSent: bigint
  notificationSuppressed: bigint
  notificationUnavailable: bigint
  providerAttempts: bigint
  providerFailed: bigint
  providerOutcomeUnknown: bigint
  providerRetries: bigint
  providerSent: bigint
  teamClaimed: bigint
  teamEscalationsOpened: bigint
  teamEscalationsResolved: bigint
  teamHandedOff: bigint
  teamOverdueCurrent: bigint
  teamReassigned: bigint
  teamReleased: bigint
  teamUnclaimedCurrent: bigint
}

type StoreConversationAggregateInput = {
  end: Date
  start: Date
  storeId?: string
  tenantId: string
}

function count(value: bigint | undefined) {
  const result = Number(value ?? 0n)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error("REPORT_COUNT_OUT_OF_RANGE")
  }
  return result
}

function duration(value: number | null | undefined) {
  if (value === null || value === undefined) return null
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("REPORT_DURATION_OUT_OF_RANGE")
  }
  return value
}

/**
 * Reads all Store Conversation service-quality counters in one bounded SQL
 * round trip. It returns aggregate counts only and cannot project message
 * bodies, contact data, credentials, media, or provider identifiers.
 */
export async function getStoreConversationReportAggregates(
  db: PrismaClient,
  input: StoreConversationAggregateInput,
): Promise<Omit<ServiceCommerceStoreConversationReport, "costVisibility">> {
  const rows = await db.$queryRaw<StoreConversationAggregateRow[]>(Prisma.sql`
    WITH params AS (
      SELECT
        CAST(${input.tenantId} AS text) AS tenant_id,
        CAST(${input.storeId ?? null} AS text) AS store_id,
        CAST(${input.start} AS timestamptz) AS start_at,
        CAST(${input.end} AS timestamptz) AS end_at
    ), first_customer AS (
      SELECT
        event."conversationId",
        MIN(event."occurredAt") AS customer_at
      FROM "StoreConversationAuditEvent" event
      CROSS JOIN params p
      WHERE event."tenantId" = p.tenant_id
        AND (p.store_id IS NULL OR event."storeId" = p.store_id)
        AND event."occurredAt" >= p.start_at
        AND event."occurredAt" < p.end_at
        AND event."type" IN ('CUSTOMER_MESSAGE_APPENDED', 'CUSTOMER_ATTACHMENT_APPENDED')
      GROUP BY event."conversationId"
    ), first_response AS (
      SELECT
        customer."conversationId",
        customer.customer_at,
        MIN(reply."occurredAt") AS reply_at
      FROM first_customer customer
      CROSS JOIN params p
      LEFT JOIN "StoreConversationAuditEvent" reply
        ON reply."conversationId" = customer."conversationId"
        AND reply."tenantId" = p.tenant_id
        AND (p.store_id IS NULL OR reply."storeId" = p.store_id)
        AND reply."type" = 'STORE_REPLY_APPENDED'
        AND reply."occurredAt" >= customer.customer_at
        AND reply."occurredAt" < p.end_at
      GROUP BY customer."conversationId", customer.customer_at
    ), notification_wait AS (
      SELECT
        intent."createdAt" AS started_at,
        COALESCE(intent."cancelledAt", intent."deliveredAt", intent."sentAt") AS resolved_at
      FROM "StoreConversationNotificationIntent" intent
      CROSS JOIN params p
      WHERE intent."tenantId" = p.tenant_id
        AND (p.store_id IS NULL OR intent."storeId" = p.store_id)
        AND intent."createdAt" >= p.start_at
        AND intent."createdAt" < p.end_at
    )
    SELECT
      (SELECT COUNT(*) FROM "StoreConversationAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'BOOTSTRAPPED')::bigint AS "lifecycleConversationsStarted",
      (SELECT COUNT(*) FROM "StoreConversationMessage"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "authorKind" = 'CUSTOMER')::bigint AS "lifecycleCustomerMessages",
      (SELECT COUNT(*) FROM "StoreConversationMessage"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "authorKind" = 'STORE_ATTENDANT')::bigint AS "lifecycleStoreReplies",
      (SELECT COUNT(*) FROM first_response
        WHERE reply_at IS NOT NULL)::bigint AS "lifecycleFirstResponseKnown",
      (SELECT COUNT(*) FROM first_response
        WHERE reply_at IS NULL)::bigint AS "lifecycleFirstResponseUnknown",
      (SELECT AVG(EXTRACT(EPOCH FROM (reply_at - customer_at)))::double precision
        FROM first_response WHERE reply_at IS NOT NULL) AS "lifecycleFirstResponseAverageSeconds",
      (SELECT COUNT(*) FROM "StoreConversationRequestLink"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "createdAt" >= p.start_at AND "createdAt" < p.end_at
          AND "kind" = 'COMMERCE_INQUIRY')::bigint AS "lifecycleProductRequests",
      (SELECT COUNT(*) FROM "StoreConversationRequestLink"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "createdAt" >= p.start_at AND "createdAt" < p.end_at
          AND "kind" = 'SERVICE_REQUEST')::bigint AS "lifecycleServiceRequests",
      (SELECT COUNT(*) FROM "StoreConversationRequestLink"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "createdAt" >= p.start_at AND "createdAt" < p.end_at
          AND "kind" = 'PRESCRIPTION_REQUEST')::bigint AS "lifecyclePrescriptionRequests",
      (SELECT COUNT(*) FROM "StoreConversation"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "lifecycle" = 'ACTIVE' AND "moderationState" = 'OPEN')::bigint AS "lifecycleActiveCurrent",
      (SELECT COUNT(*) FROM "StoreConversation"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "lifecycle" = 'ARCHIVED')::bigint AS "lifecycleArchivedCurrent",
      (SELECT COUNT(*) FROM "StoreConversation"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "moderationState" = 'RESTRICTED')::bigint AS "lifecycleRestrictedCurrent",
      (SELECT COUNT(*) FROM notification_wait
        WHERE resolved_at IS NOT NULL)::bigint AS "lifecycleUnreadKnown",
      (SELECT COUNT(*) FROM notification_wait
        WHERE resolved_at IS NULL)::bigint AS "lifecycleUnreadUnknown",
      (SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - started_at)))::double precision
        FROM notification_wait WHERE resolved_at IS NOT NULL) AS "lifecycleUnreadAverageSeconds",
      (SELECT COUNT(*) FROM "StoreConversationAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'ARCHIVED')::bigint AS "lifecycleArchived",
      (SELECT COUNT(*) FROM "StoreConversationAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'REACTIVATED')::bigint AS "lifecycleReactivated",
      (SELECT COUNT(*) FROM "StoreConversationAssignmentEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'CLAIMED')::bigint AS "teamClaimed",
      (SELECT COUNT(*) FROM "StoreConversationAssignmentEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" IN ('RELEASED', 'MEMBERSHIP_RELEASED'))::bigint AS "teamReleased",
      (SELECT COUNT(*) FROM "StoreConversationAssignmentEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'HANDED_OFF')::bigint AS "teamHandedOff",
      (SELECT COUNT(*) FROM "StoreConversationAssignmentEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'REASSIGNED')::bigint AS "teamReassigned",
      (SELECT COUNT(*) FROM "StoreConversationEscalationEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'OPENED')::bigint AS "teamEscalationsOpened",
      (SELECT COUNT(*) FROM "StoreConversationEscalationEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'RESOLVED')::bigint AS "teamEscalationsResolved",
      (SELECT COUNT(*) FROM "StoreConversation"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "lifecycle" = 'ACTIVE' AND "assignedMembershipId" IS NULL)::bigint AS "teamUnclaimedCurrent",
      (SELECT COUNT(*) FROM "StoreConversation"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "lifecycle" = 'ACTIVE' AND "responseDueAt" < p.end_at
          AND ("lastStoreReplyAt" IS NULL OR "lastStoreReplyAt" < "lastCustomerMessageAt"))::bigint AS "teamOverdueCurrent",
      (SELECT COUNT(*) FROM "StoreConversationAvailabilityAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'SCHEDULE_UPDATED')::bigint AS "availabilityScheduleUpdates",
      (SELECT COUNT(*) FROM "StoreConversationAvailabilityAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'PAUSED')::bigint AS "availabilityPaused",
      (SELECT COUNT(*) FROM "StoreConversationAvailabilityAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'RESUMED')::bigint AS "availabilityResumed",
      (SELECT COUNT(*) FROM "StoreConversationEscalationEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'OPENED'
          AND "kind" IN ('UNCLAIMED', 'OVERDUE', 'MEMBERSHIP_UNAVAILABLE'))::bigint AS "availabilityCoverageBlocks",
      (SELECT COUNT(*) FROM "ServiceCommercePolicyAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "createdAt" >= p.start_at AND "createdAt" < p.end_at
          AND "purpose" = 'customer_entry_point_projection'
          AND "observedOutcome" <> 'allowed')::bigint AS "availabilityPolicyBlocks",
      (SELECT COUNT(*) FROM "WhatsAppConnectionAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "effectiveAt" >= p.start_at AND "effectiveAt" < p.end_at
          AND "type" = 'readiness_failed')::bigint AS "availabilityProviderBlocks",
      (SELECT COUNT(*) FROM "StoreConversationNotificationIntent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "createdAt" >= p.start_at AND "createdAt" < p.end_at)::bigint AS "notificationScheduled",
      (SELECT COUNT(*) FROM "StoreConversationNotificationIntent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "sentAt" >= p.start_at AND "sentAt" < p.end_at)::bigint AS "notificationSent",
      (SELECT COUNT(*) FROM "StoreConversationNotificationReceipt"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "status" = 'DELIVERED')::bigint AS "notificationDelivered",
      (SELECT COUNT(*) FROM "StoreConversationNotificationAttempt"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "completedAt" >= p.start_at AND "completedAt" < p.end_at
          AND "status" = 'FAILED')::bigint AS "notificationFailed",
      (SELECT COUNT(*) FROM "StoreConversationNotificationIntent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "cancelledAt" >= p.start_at AND "cancelledAt" < p.end_at)::bigint AS "notificationCancelled",
      (SELECT COUNT(*) FROM "StoreConversationNotificationAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'INTENT_COALESCED')::bigint AS "notificationCoalesced",
      (SELECT COUNT(*) FROM "StoreConversationNotificationAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'INTENT_CANCELLED'
          AND "reasonCode" = 'read_before_notification_claim')::bigint AS "notificationCancelledByRead",
      (SELECT COUNT(*) FROM "StoreConversationNotificationAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'INTENT_CANCELLED'
          AND "reasonCode" IN ('conversation_unavailable', 'message_not_visible', 'account_access_unavailable', 'guest_access_unavailable'))::bigint AS "notificationUnavailable",
      (SELECT COUNT(*) FROM "StoreConversationNotificationAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'INTENT_CANCELLED'
          AND "reasonCode" IN ('notification_preference_disabled', 'no_eligible_notification_channel'))::bigint AS "notificationSuppressed",
      (SELECT COUNT(*) FROM "StoreConversationMessage"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "channel" = 'WEB')::bigint AS "channelWebMessages",
      (SELECT COUNT(*) FROM "StoreConversationMessage"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "channel" = 'MOBILE')::bigint AS "channelMobileMessages",
      (SELECT COUNT(*) FROM "StoreConversationMessage"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "channel" = 'WHATSAPP')::bigint AS "channelWhatsAppMessages",
      (SELECT COUNT(*) FROM "StoreConversationChannelConfigurationAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at)::bigint AS "channelModeChanges",
      (SELECT COUNT(*) FROM "StoreConversationChannelConfiguration"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "desiredMode" = 'EWATRADE_CHAT')::bigint AS "channelDesiredChatCurrent",
      (SELECT COUNT(*) FROM "StoreConversationChannelConfiguration"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "desiredMode" = 'WHATSAPP')::bigint AS "channelDesiredWhatsAppCurrent",
      (SELECT COUNT(*) FROM "StoreConversationChannelConfiguration"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "desiredMode" = 'BOTH')::bigint AS "channelDesiredBothCurrent",
      (SELECT COUNT(*) FROM "StoreConversationWhatsAppBridgeAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" = 'NAVIGATION_ISSUED' AND "outcome" = 'ALLOWED')::bigint AS "channelBridgeInitiated",
      (SELECT COUNT(*) FROM "StoreConversationWhatsAppBridgeAuditEvent"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "occurredAt" >= p.start_at AND "occurredAt" < p.end_at
          AND "type" IN ('LINKED', 'CHOICE_SELECTED') AND "outcome" = 'ALLOWED')::bigint AS "channelBridgeConfirmed",
      (SELECT COUNT(*) FROM "StoreConversationWhatsAppCandidate"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "updatedAt" >= p.start_at AND "updatedAt" < p.end_at
          AND "status" = 'CONTINUED')::bigint AS "channelDirectContinued",
      (SELECT COUNT(*) FROM "StoreConversationWhatsAppCandidate"
        WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
          AND "updatedAt" >= p.start_at AND "updatedAt" < p.end_at
          AND "status" = 'STARTED_NEW')::bigint AS "channelDirectStartedNew",
      (
        (SELECT COUNT(*) FROM "StoreConversationNotificationAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "startedAt" >= p.start_at AND "startedAt" < p.end_at) +
        (SELECT COALESCE(SUM("attemptCount"), 0) FROM "StoreConversationWhatsAppBridgeAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at) +
        (SELECT COALESCE(SUM("attemptCount"), 0) FROM "StoreConversationWhatsAppCandidateAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at) +
        (SELECT COALESCE(SUM("attemptCount"), 0) FROM "StoreConversationWhatsAppRecoveryAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at) +
        (SELECT COALESCE(SUM("attemptCount"), 0) FROM "StoreConversationWhatsAppOutboundAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at)
      )::bigint AS "providerAttempts",
      (
        (SELECT COUNT(*) FROM "StoreConversationNotificationAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "startedAt" >= p.start_at AND "startedAt" < p.end_at
            AND "status" = 'SENT') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppBridgeAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'SENT') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppCandidateAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'SENT') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppRecoveryAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'SENT') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppOutboundAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'SENT')
      )::bigint AS "providerSent",
      (
        (SELECT COUNT(*) FROM "StoreConversationNotificationAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "startedAt" >= p.start_at AND "startedAt" < p.end_at AND "status" = 'FAILED') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppBridgeAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'FAILED') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppCandidateAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'FAILED') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppRecoveryAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'FAILED') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppOutboundAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'FAILED')
      )::bigint AS "providerFailed",
      (
        (SELECT COUNT(*) FROM "StoreConversationNotificationAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "startedAt" >= p.start_at AND "startedAt" < p.end_at AND "status" = 'OUTCOME_UNKNOWN') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppBridgeAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'OUTCOME_UNKNOWN') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppCandidateAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'OUTCOME_UNKNOWN') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppRecoveryAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'OUTCOME_UNKNOWN') +
        (SELECT COUNT(*) FROM "StoreConversationWhatsAppOutboundAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at AND "status" = 'OUTCOME_UNKNOWN')
      )::bigint AS "providerOutcomeUnknown",
      (
        (SELECT COUNT(*) FROM "StoreConversationNotificationAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "startedAt" >= p.start_at AND "startedAt" < p.end_at
            AND "attemptNumber" > 1) +
        (SELECT COALESCE(SUM(GREATEST("attemptCount" - 1, 0)), 0) FROM "StoreConversationWhatsAppBridgeAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at) +
        (SELECT COALESCE(SUM(GREATEST("attemptCount" - 1, 0)), 0) FROM "StoreConversationWhatsAppCandidateAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at) +
        (SELECT COALESCE(SUM(GREATEST("attemptCount" - 1, 0)), 0) FROM "StoreConversationWhatsAppRecoveryAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at) +
        (SELECT COALESCE(SUM(GREATEST("attemptCount" - 1, 0)), 0) FROM "StoreConversationWhatsAppOutboundAttempt"
          WHERE "tenantId" = p.tenant_id AND (p.store_id IS NULL OR "storeId" = p.store_id)
            AND "createdAt" >= p.start_at AND "createdAt" < p.end_at)
      )::bigint AS "providerRetries"
    FROM params p
  `)
  const row = rows[0]
  if (!row) throw new Error("REPORT_STORE_CONVERSATION_AGGREGATE_UNAVAILABLE")

  return {
    availability: {
      coverageBlockObservations: count(row.availabilityCoverageBlocks),
      paused: count(row.availabilityPaused),
      policyBlockObservations: count(row.availabilityPolicyBlocks),
      providerBlockObservations: count(row.availabilityProviderBlocks),
      resumed: count(row.availabilityResumed),
      scheduleUpdates: count(row.availabilityScheduleUpdates),
      scheduledClosureObservations: null,
    },
    channels: {
      bridgeConfirmed: count(row.channelBridgeConfirmed),
      bridgeInitiated: count(row.channelBridgeInitiated),
      desiredBothCurrent: count(row.channelDesiredBothCurrent),
      desiredChatCurrent: count(row.channelDesiredChatCurrent),
      desiredWhatsAppCurrent: count(row.channelDesiredWhatsAppCurrent),
      directContinued: count(row.channelDirectContinued),
      directStartedNew: count(row.channelDirectStartedNew),
      mobileMessages: count(row.channelMobileMessages),
      modeChanges: count(row.channelModeChanges),
      providerHistoryUnknown: null,
      webMessages: count(row.channelWebMessages),
      whatsAppMessages: count(row.channelWhatsAppMessages),
    },
    lifecycle: {
      archived: count(row.lifecycleArchived),
      conversationsStarted: count(row.lifecycleConversationsStarted),
      currentSnapshot: {
        active: count(row.lifecycleActiveCurrent),
        archived: count(row.lifecycleArchivedCurrent),
        restricted: count(row.lifecycleRestrictedCurrent),
      },
      customerMessages: count(row.lifecycleCustomerMessages),
      firstResponse: {
        averageSeconds: duration(row.lifecycleFirstResponseAverageSeconds),
        knownCount: count(row.lifecycleFirstResponseKnown),
        unknownCount: count(row.lifecycleFirstResponseUnknown),
      },
      reactivated: count(row.lifecycleReactivated),
      requestKinds: {
        prescription: count(row.lifecyclePrescriptionRequests),
        product: count(row.lifecycleProductRequests),
        service: count(row.lifecycleServiceRequests),
      },
      storeReplies: count(row.lifecycleStoreReplies),
      unreadWait: {
        averageSeconds: duration(row.lifecycleUnreadAverageSeconds),
        knownCount: count(row.lifecycleUnreadKnown),
        unknownCount: count(row.lifecycleUnreadUnknown),
      },
    },
    notifications: {
      cancelled: count(row.notificationCancelled),
      cancelledByRead: count(row.notificationCancelledByRead),
      coalesced: count(row.notificationCoalesced),
      delivered: count(row.notificationDelivered),
      failed: count(row.notificationFailed),
      scheduled: count(row.notificationScheduled),
      sent: count(row.notificationSent),
      suppressed: count(row.notificationSuppressed),
      unavailable: count(row.notificationUnavailable),
    },
    providerReliability: {
      attempts: count(row.providerAttempts),
      failed: count(row.providerFailed),
      outcomeUnknown: count(row.providerOutcomeUnknown),
      retries: count(row.providerRetries),
      sent: count(row.providerSent),
    },
    team: {
      claimed: count(row.teamClaimed),
      escalationsOpened: count(row.teamEscalationsOpened),
      escalationsResolved: count(row.teamEscalationsResolved),
      handedOff: count(row.teamHandedOff),
      overdueCurrent: count(row.teamOverdueCurrent),
      reassigned: count(row.teamReassigned),
      released: count(row.teamReleased),
      unclaimedCurrent: count(row.teamUnclaimedCurrent),
    },
  }
}
