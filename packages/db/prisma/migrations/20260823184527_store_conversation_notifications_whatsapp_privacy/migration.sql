/*
  Warnings:

  - A unique constraint covering the columns `[rotatedToCredentialId]` on the table `StoreConversationGuestCredential` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StoreConversationModerationAction" AS ENUM ('RESTRICT', 'REINSTATE');

-- CreateEnum
CREATE TYPE "StoreConversationModerationReason" AS ENUM ('SPAM_OR_ABUSE', 'SECURITY_REVIEW', 'POLICY_REVIEW', 'OPERATOR_REVIEW', 'APPEAL_APPROVED', 'REVIEW_COMPLETE');

-- CreateEnum
CREATE TYPE "StoreConversationModerationAuditOutcome" AS ENUM ('ALLOWED', 'DENIED');

-- CreateEnum
CREATE TYPE "StoreConversationSensitiveReadKind" AS ENUM ('TIMELINE', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "StoreConversationSensitiveReadPurpose" AS ENUM ('CONVERSATION_SUPPORT', 'CUSTOMER_REQUEST_ATTACHMENT_REVIEW');

-- CreateEnum
CREATE TYPE "StoreConversationSensitiveReadOutcome" AS ENUM ('ALLOWED', 'DENIED');

-- CreateEnum
CREATE TYPE "StoreConversationSecurityScopeKind" AS ENUM ('PRINCIPAL', 'DEVICE', 'STORE_ENTRY', 'STORE', 'NETWORK');

-- CreateEnum
CREATE TYPE "StoreConversationSecurityPurpose" AS ENUM ('MESSAGE', 'MEDIA', 'VOICE', 'ACTION', 'BRIDGE', 'VERIFICATION');

-- CreateEnum
CREATE TYPE "StoreConversationSecurityDecision" AS ENUM ('ALLOW', 'CHALLENGE', 'DENY');

-- CreateEnum
CREATE TYPE "StoreConversationSecurityChallengeStatus" AS ENUM ('ISSUED', 'APPROVED', 'CONSUMED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "StoreConversationRetentionClass" AS ENUM ('GUEST_CREDENTIAL', 'VERIFIED_CONTACT', 'PRESENTATION_MESSAGE', 'PROVIDER_ATTEMPT', 'SECURITY_EVIDENCE');

-- CreateEnum
CREATE TYPE "StoreConversationPrivacyPrincipalKind" AS ENUM ('ACCOUNT', 'GUEST');

-- CreateEnum
CREATE TYPE "StoreConversationPrivacyRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "StoreConversationPrivacyClassification" AS ENUM ('GUEST_CREDENTIAL', 'VERIFIED_CONTACT', 'PRESENTATION_MESSAGE', 'GENERIC_MEDIA', 'PROVIDER_ATTEMPT', 'SECURITY_EVIDENCE', 'COMMERCIAL_RECORD', 'CLINICAL_RECORD', 'IMMUTABLE_AUDIT');

-- CreateEnum
CREATE TYPE "StoreConversationPrivacyOutcomeStatus" AS ENUM ('REMOVED', 'RETAINED_REQUIRED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "StoreConversationDesiredMode" AS ENUM ('EWATRADE_CHAT', 'WHATSAPP', 'BOTH');

-- CreateEnum
CREATE TYPE "StoreConversationChannelConfigurationAuditEventType" AS ENUM ('UPDATED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppBridgeCapabilityStatus" AS ENUM ('PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppBridgeIntent" AS ENUM ('CONTINUE_OR_NEW');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppBridgeStatus" AS ENUM ('AWAITING_CHOICE', 'AWAITING_REQUEST_KIND', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppBridgeChoice" AS ENUM ('CONTINUE_CURRENT_REQUEST', 'START_NEW_REQUEST');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppBridgeChoiceCapabilityStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppBridgeAttemptStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppBridgeAuditType" AS ENUM ('NAVIGATION_ISSUED', 'LINKED', 'CHOICE_SELECTED', 'REVOKED', 'DENIED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppBridgeAuditOutcome" AS ENUM ('ALLOWED', 'DENIED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppBridgePrincipalKind" AS ENUM ('GUEST_IDENTITY', 'ACCOUNT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppCandidateEvidenceKind" AS ENUM ('GUEST_VERIFIED_CONTACT', 'ACCOUNT_VERIFIED_PHONE');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppCandidateStatus" AS ENUM ('PENDING', 'CONTINUED', 'STARTED_NEW', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppCandidateAction" AS ENUM ('CONTINUE', 'START_NEW', 'NOT_MINE');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppCandidateActionCapabilityStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppCandidateAttemptStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppDirectSessionStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppObservationDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppObservationProvenance" AS ENUM ('CLOUD_API_INBOUND', 'CLOUD_API_OUTBOUND', 'BUSINESS_APP_ECHO', 'BUSINESS_APP_HISTORY');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppObservationStatus" AS ENUM ('RECEIVED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'DELETED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppOutboundAttemptStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppRecoveryKind" AS ENUM ('AMBIGUOUS_CANDIDATE');

-- CreateEnum
CREATE TYPE "StoreConversationWhatsAppRecoveryAttemptStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationContactChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationContactStatus" AS ENUM ('PENDING', 'VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationVerificationStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CONSUMED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationVerificationPurpose" AS ENUM ('CUSTOMER_NOTIFICATION_CONTACT');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "StoreConversationPushEndpointKind" AS ENUM ('NATIVE_EXPO', 'WEB_PUSH');

-- CreateEnum
CREATE TYPE "StoreConversationPushEndpointStatus" AS ENUM ('ACTIVE', 'INVALIDATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationKind" AS ENUM ('UNREAD_RESPONSE', 'STORE_REOPENED');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationPrincipalKind" AS ENUM ('GUEST_IDENTITY', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationIntentStatus" AS ENUM ('WAITING', 'PENDING', 'CLAIMED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'OUTCOME_UNKNOWN');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationAttemptStatus" AS ENUM ('CLAIMED', 'SENT', 'FAILED', 'OUTCOME_UNKNOWN');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationReceiptStatus" AS ENUM ('DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationCommandKind" AS ENUM ('CONTACT_VERIFICATION_REQUESTED', 'CONTACT_VERIFIED', 'CONTACT_REVOKED', 'PREFERENCE_UPDATED', 'PUSH_REGISTERED', 'PUSH_REVOKED', 'REOPENING_SUBSCRIBED', 'ACCOUNT_PROGRESS_ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "StoreConversationNotificationAuditType" AS ENUM ('CONTACT_VERIFICATION_REQUESTED', 'CONTACT_VERIFIED', 'CONTACT_REVOKED', 'PREFERENCE_UPDATED', 'PUSH_REGISTERED', 'PUSH_REVOKED', 'REOPENING_SUBSCRIBED', 'REOPENING_RELEASED', 'INTENT_SCHEDULED', 'INTENT_COALESCED', 'INTENT_CLAIMED', 'INTENT_CANCELLED', 'ATTEMPT_COMPLETED', 'ATTEMPT_FAILED');

-- AlterEnum
ALTER TYPE "WhatsAppInboundEventStatus" ADD VALUE 'AWAITING_CUSTOMER_CHOICE';

-- AlterTable
ALTER TABLE "StoreConversation" ADD COLUMN     "moderationReason" "StoreConversationModerationReason",
ADD COLUMN     "moderationRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StoreConversationAvailabilityConfiguration" ADD COLUMN     "unreadNotificationGraceSeconds" INTEGER NOT NULL DEFAULT 45;

-- AlterTable
ALTER TABLE "StoreConversationGuestCredential" ADD COLUMN     "overlapExpiresAt" TIMESTAMP(3),
ADD COLUMN     "retentionClass" "StoreConversationRetentionClass" NOT NULL DEFAULT 'GUEST_CREDENTIAL',
ADD COLUMN     "rotatedToCredentialId" TEXT;

-- AlterTable
ALTER TABLE "StoreConversationMessage" ADD COLUMN     "presentationRedactedAt" TIMESTAMP(3),
ADD COLUMN     "retentionClass" "StoreConversationRetentionClass" NOT NULL DEFAULT 'PRESENTATION_MESSAGE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StoreConversationGuestCredentialRotation" (
    "id" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "sourceCredentialId" TEXT NOT NULL,
    "targetCredentialId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "purpose" "StoreConversationGuestCredentialPurpose" NOT NULL,
    "overlapExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationGuestCredentialRotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationModerationCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "action" "StoreConversationModerationAction" NOT NULL,
    "reason" "StoreConversationModerationReason" NOT NULL,
    "operatorNote" TEXT,
    "expectedRevision" INTEGER NOT NULL,
    "resultingRevision" INTEGER NOT NULL,
    "resultingState" "StoreConversationModerationState" NOT NULL,
    "restrictedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationModerationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationModerationAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "conversationId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorMembershipId" TEXT,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "action" "StoreConversationModerationAction" NOT NULL,
    "reason" "StoreConversationModerationReason" NOT NULL,
    "outcome" "StoreConversationModerationAuditOutcome" NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "resultingRevision" INTEGER,
    "reasonCode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationModerationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationSensitiveReadAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "conversationId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorMembershipId" TEXT,
    "kind" "StoreConversationSensitiveReadKind" NOT NULL,
    "purpose" "StoreConversationSensitiveReadPurpose" NOT NULL,
    "outcome" "StoreConversationSensitiveReadOutcome" NOT NULL,
    "subjectReferenceDigest" TEXT,
    "reasonCode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationSensitiveReadAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationSecurityWindow" (
    "id" TEXT NOT NULL,
    "scopeKind" "StoreConversationSecurityScopeKind" NOT NULL,
    "scopeDigest" TEXT NOT NULL,
    "purpose" "StoreConversationSecurityPurpose" NOT NULL,
    "windowStartAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "weightedCost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationSecurityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationSecurityEvent" (
    "id" TEXT NOT NULL,
    "operationDigest" TEXT NOT NULL,
    "purpose" "StoreConversationSecurityPurpose" NOT NULL,
    "retentionClass" "StoreConversationRetentionClass" NOT NULL DEFAULT 'SECURITY_EVIDENCE',
    "decision" "StoreConversationSecurityDecision" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "principalScopeDigest" TEXT NOT NULL,
    "deviceScopeDigest" TEXT,
    "storeEntryScopeDigest" TEXT,
    "storeScopeDigest" TEXT NOT NULL,
    "tenantScopeDigest" TEXT NOT NULL,
    "conversationScopeDigest" TEXT,
    "networkScopeDigest" TEXT,
    "actionCost" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationSecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationSecurityChallenge" (
    "id" TEXT NOT NULL,
    "securityEventId" TEXT NOT NULL,
    "proofDigest" TEXT NOT NULL,
    "principalScopeDigest" TEXT NOT NULL,
    "purpose" "StoreConversationSecurityPurpose" NOT NULL,
    "status" "StoreConversationSecurityChallengeStatus" NOT NULL DEFAULT 'ISSUED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationSecurityChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationPrivacyRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "principalKind" "StoreConversationPrivacyPrincipalKind" NOT NULL,
    "accountUserId" TEXT,
    "guestIdentityId" TEXT,
    "proofChallengeId" TEXT,
    "operationDigest" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "StoreConversationPrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationPrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationPrivacyRequestClassification" (
    "id" TEXT NOT NULL,
    "privacyRequestId" TEXT NOT NULL,
    "classification" "StoreConversationPrivacyClassification" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationPrivacyRequestClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationPrivacyRequestOutcome" (
    "id" TEXT NOT NULL,
    "privacyRequestId" TEXT NOT NULL,
    "classification" "StoreConversationPrivacyClassification" NOT NULL,
    "status" "StoreConversationPrivacyOutcomeStatus" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationPrivacyRequestOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationAccountWatermark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "accountUserId" TEXT NOT NULL,
    "deliveredThroughSequence" INTEGER NOT NULL DEFAULT 0,
    "readThroughSequence" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationAccountWatermark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationChannelConfiguration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "desiredMode" "StoreConversationDesiredMode" NOT NULL DEFAULT 'EWATRADE_CHAT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationChannelConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationChannelConfigurationCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "desiredMode" "StoreConversationDesiredMode" NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationChannelConfigurationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationChannelConfigurationAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" "StoreConversationChannelConfigurationAuditEventType" NOT NULL DEFAULT 'UPDATED',
    "fromMode" "StoreConversationDesiredMode",
    "toMode" "StoreConversationDesiredMode" NOT NULL,
    "revision" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationChannelConfigurationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppBridgeCapability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "guestIdentityId" TEXT,
    "accountAccessId" TEXT,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "intent" "StoreConversationWhatsAppBridgeIntent" NOT NULL DEFAULT 'CONTINUE_OR_NEW',
    "sourceKind" "StoreConversationRequestKind",
    "sourceId" TEXT,
    "sourceRevision" INTEGER,
    "status" "StoreConversationWhatsAppBridgeCapabilityStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppBridgeCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppBridge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "capabilityId" TEXT,
    "candidateId" TEXT,
    "guestIdentityId" TEXT,
    "accountAccessId" TEXT,
    "externalCustomerIdCiphertext" TEXT NOT NULL,
    "externalCustomerIdDigest" TEXT NOT NULL,
    "status" "StoreConversationWhatsAppBridgeStatus" NOT NULL DEFAULT 'AWAITING_CHOICE',
    "choice" "StoreConversationWhatsAppBridgeChoice",
    "sourceKind" "StoreConversationRequestKind",
    "sourceId" TEXT,
    "sourceRevision" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "linkedMessageId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "choiceAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppBridge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppBridgeChoiceCapability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bridgeId" TEXT NOT NULL,
    "bridgeRevision" INTEGER NOT NULL,
    "choice" "StoreConversationWhatsAppBridgeChoice" NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "status" "StoreConversationWhatsAppBridgeChoiceCapabilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppBridgeChoiceCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppBridgeAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bridgeId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "bridgeRevision" INTEGER NOT NULL,
    "status" "StoreConversationWhatsAppBridgeAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "providerReferenceDigest" TEXT,
    "failureCode" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppBridgeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppBridgeAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "capabilityId" TEXT,
    "bridgeId" TEXT,
    "principalKind" "StoreConversationWhatsAppBridgePrincipalKind" NOT NULL,
    "guestIdentityId" TEXT,
    "accountUserId" TEXT,
    "type" "StoreConversationWhatsAppBridgeAuditType" NOT NULL,
    "outcome" "StoreConversationWhatsAppBridgeAuditOutcome" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationWhatsAppBridgeAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationGuestNotificationContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "channel" "StoreConversationNotificationContactChannel" NOT NULL,
    "retentionClass" "StoreConversationRetentionClass" NOT NULL DEFAULT 'VERIFIED_CONTACT',
    "destinationCiphertext" TEXT NOT NULL,
    "destinationDigest" TEXT NOT NULL,
    "maskedDestination" TEXT NOT NULL,
    "status" "StoreConversationNotificationContactStatus" NOT NULL DEFAULT 'PENDING',
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationGuestNotificationContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppCandidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "inboundEventId" TEXT NOT NULL,
    "inboundProviderEventDigest" TEXT NOT NULL,
    "externalCustomerIdDigest" TEXT NOT NULL,
    "notificationDestinationDigest" TEXT NOT NULL,
    "evidenceKind" "StoreConversationWhatsAppCandidateEvidenceKind" NOT NULL,
    "notificationContactId" TEXT,
    "accountUserId" TEXT,
    "accountAccessId" TEXT,
    "sourceKind" "StoreConversationRequestKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "status" "StoreConversationWhatsAppCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "selectedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppCandidateActionCapability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "candidateRevision" INTEGER NOT NULL,
    "action" "StoreConversationWhatsAppCandidateAction" NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "status" "StoreConversationWhatsAppCandidateActionCapabilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppCandidateActionCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppCandidateAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "candidateRevision" INTEGER NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "StoreConversationWhatsAppCandidateAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "providerReferenceDigest" TEXT,
    "failureCode" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppCandidateAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppCandidateSuppression" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "externalCustomerIdDigest" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "rejectionCount" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastRejectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppCandidateSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppRecoveryAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "inboundEventId" TEXT NOT NULL,
    "kind" "StoreConversationWhatsAppRecoveryKind" NOT NULL,
    "status" "StoreConversationWhatsAppRecoveryAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "providerReferenceDigest" TEXT,
    "failureCode" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppRecoveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppDirectSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalCustomerIdCiphertext" TEXT NOT NULL,
    "externalCustomerIdDigest" TEXT NOT NULL,
    "sourceKind" "StoreConversationRequestKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "status" "StoreConversationWhatsAppDirectSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppDirectSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppObservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "inboundEventId" TEXT,
    "messageId" TEXT,
    "bridgeId" TEXT,
    "directSessionId" TEXT,
    "providerMessageDigest" TEXT NOT NULL,
    "direction" "StoreConversationWhatsAppObservationDirection" NOT NULL,
    "provenance" "StoreConversationWhatsAppObservationProvenance" NOT NULL,
    "status" "StoreConversationWhatsAppObservationStatus" NOT NULL,
    "statusOccurredAt" TIMESTAMP(3) NOT NULL,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppObservationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "eventDigest" TEXT NOT NULL,
    "status" "StoreConversationWhatsAppObservationStatus" NOT NULL,
    "failureCode" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationWhatsAppObservationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationWhatsAppOutboundAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "bridgeId" TEXT,
    "directSessionId" TEXT,
    "status" "StoreConversationWhatsAppOutboundAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "retentionClass" "StoreConversationRetentionClass" NOT NULL DEFAULT 'PROVIDER_ATTEMPT',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "providerReferenceDigest" TEXT,
    "failureCode" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationWhatsAppOutboundAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationGuestNotificationVerification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "purpose" "StoreConversationNotificationVerificationPurpose" NOT NULL DEFAULT 'CUSTOMER_NOTIFICATION_CONTACT',
    "tokenDigest" TEXT NOT NULL,
    "status" "StoreConversationNotificationVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "sendAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxSendAttempts" INTEGER NOT NULL DEFAULT 3,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationGuestNotificationVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationAccountNotificationPreference" (
    "id" TEXT NOT NULL,
    "accountUserId" TEXT NOT NULL,
    "unreadEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reopeningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "orderedChannels" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationAccountNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationPushEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "guestCredentialId" TEXT,
    "accountUserId" TEXT,
    "kind" "StoreConversationPushEndpointKind" NOT NULL,
    "endpointCiphertext" TEXT NOT NULL,
    "endpointDigest" TEXT NOT NULL,
    "status" "StoreConversationPushEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationPushEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationNotificationCommand" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "guestCredentialId" TEXT,
    "accountUserId" TEXT,
    "principalKey" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "kind" "StoreConversationNotificationCommandKind" NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationNotificationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationNotificationIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" "StoreConversationNotificationKind" NOT NULL,
    "principalKind" "StoreConversationNotificationPrincipalKind" NOT NULL,
    "guestIdentityId" TEXT,
    "accountUserId" TEXT,
    "deduplicationKey" TEXT NOT NULL,
    "coalescingKey" TEXT NOT NULL,
    "targetMessageId" TEXT,
    "targetMessageSequence" INTEGER,
    "availabilityConfigurationRevision" INTEGER,
    "subscribedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "StoreConversationNotificationIntentStatus" NOT NULL DEFAULT 'PENDING',
    "selectedChannel" "StoreConversationNotificationChannel",
    "selectedContactId" TEXT,
    "selectedPushEndpointId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationNotificationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationNotificationAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "notificationIntentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "StoreConversationNotificationAttemptStatus" NOT NULL DEFAULT 'CLAIMED',
    "channel" "StoreConversationNotificationChannel" NOT NULL,
    "providerKey" TEXT,
    "providerOperationDigest" TEXT,
    "failureCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationNotificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationNotificationReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "notificationIntentId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerReceiptDigest" TEXT NOT NULL,
    "status" "StoreConversationNotificationReceiptStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationNotificationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationNotificationAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "notificationIntentId" TEXT,
    "actorAccountUserId" TEXT,
    "actorGuestIdentityId" TEXT,
    "type" "StoreConversationNotificationAuditType" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationNotificationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestCredentialRotation_targetCredentialId_key" ON "StoreConversationGuestCredentialRotation"("targetCredentialId");

-- CreateIndex
CREATE INDEX "StoreConversationGuestCredentialRotation_sourceCredentialId_idx" ON "StoreConversationGuestCredentialRotation"("sourceCredentialId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationGuestCredentialRotation_guestIdentityId_cr_idx" ON "StoreConversationGuestCredentialRotation"("guestIdentityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestCredentialRotation_guestIdentityId_cl_key" ON "StoreConversationGuestCredentialRotation"("guestIdentityId", "clientOperationId");

-- CreateIndex
CREATE INDEX "StoreConversationModerationCommand_tenantId_storeId_created_idx" ON "StoreConversationModerationCommand"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationModerationCommand_actorUserId_createdAt_idx" ON "StoreConversationModerationCommand"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationModerationCommand_conversationId_clientOpe_key" ON "StoreConversationModerationCommand"("conversationId", "clientOperationId");

-- CreateIndex
CREATE INDEX "StoreConversationModerationAuditEvent_tenantId_storeId_occu_idx" ON "StoreConversationModerationAuditEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationModerationAuditEvent_conversationId_occurr_idx" ON "StoreConversationModerationAuditEvent"("conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationModerationAuditEvent_actorUserId_occurredA_idx" ON "StoreConversationModerationAuditEvent"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationSensitiveReadAuditEvent_tenantId_storeId_o_idx" ON "StoreConversationSensitiveReadAuditEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationSensitiveReadAuditEvent_conversationId_occ_idx" ON "StoreConversationSensitiveReadAuditEvent"("conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationSensitiveReadAuditEvent_actorUserId_occurr_idx" ON "StoreConversationSensitiveReadAuditEvent"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationSecurityWindow_purpose_expiresAt_idx" ON "StoreConversationSecurityWindow"("purpose", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationSecurityWindow_scopeKind_scopeDigest_purpo_key" ON "StoreConversationSecurityWindow"("scopeKind", "scopeDigest", "purpose", "windowStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationSecurityEvent_operationDigest_key" ON "StoreConversationSecurityEvent"("operationDigest");

-- CreateIndex
CREATE INDEX "StoreConversationSecurityEvent_principalScopeDigest_purpose_idx" ON "StoreConversationSecurityEvent"("principalScopeDigest", "purpose", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationSecurityEvent_storeScopeDigest_purpose_occ_idx" ON "StoreConversationSecurityEvent"("storeScopeDigest", "purpose", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationSecurityEvent_expiresAt_idx" ON "StoreConversationSecurityEvent"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationSecurityChallenge_securityEventId_key" ON "StoreConversationSecurityChallenge"("securityEventId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationSecurityChallenge_proofDigest_key" ON "StoreConversationSecurityChallenge"("proofDigest");

-- CreateIndex
CREATE INDEX "StoreConversationSecurityChallenge_principalScopeDigest_pur_idx" ON "StoreConversationSecurityChallenge"("principalScopeDigest", "purpose", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationSecurityChallenge_status_expiresAt_idx" ON "StoreConversationSecurityChallenge"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationPrivacyRequest_proofChallengeId_key" ON "StoreConversationPrivacyRequest"("proofChallengeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationPrivacyRequest_operationDigest_key" ON "StoreConversationPrivacyRequest"("operationDigest");

-- CreateIndex
CREATE INDEX "StoreConversationPrivacyRequest_tenantId_storeId_status_nex_idx" ON "StoreConversationPrivacyRequest"("tenantId", "storeId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StoreConversationPrivacyRequest_conversationId_createdAt_idx" ON "StoreConversationPrivacyRequest"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationPrivacyRequest_accountUserId_createdAt_idx" ON "StoreConversationPrivacyRequest"("accountUserId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationPrivacyRequest_guestIdentityId_createdAt_idx" ON "StoreConversationPrivacyRequest"("guestIdentityId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationPrivacyRequestClassification_classificatio_idx" ON "StoreConversationPrivacyRequestClassification"("classification", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationPrivacyRequestClassification_privacyReques_key" ON "StoreConversationPrivacyRequestClassification"("privacyRequestId", "classification");

-- CreateIndex
CREATE INDEX "StoreConversationPrivacyRequestOutcome_classification_statu_idx" ON "StoreConversationPrivacyRequestOutcome"("classification", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationPrivacyRequestOutcome_privacyRequestId_cla_key" ON "StoreConversationPrivacyRequestOutcome"("privacyRequestId", "classification");

-- CreateIndex
CREATE INDEX "StoreConversationAccountWatermark_accountUserId_readThrough_idx" ON "StoreConversationAccountWatermark"("accountUserId", "readThroughSequence");

-- CreateIndex
CREATE INDEX "StoreConversationAccountWatermark_tenantId_storeId_conversa_idx" ON "StoreConversationAccountWatermark"("tenantId", "storeId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAccountWatermark_conversationId_accountUse_key" ON "StoreConversationAccountWatermark"("conversationId", "accountUserId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationChannelConfiguration_storeId_key" ON "StoreConversationChannelConfiguration"("storeId");

-- CreateIndex
CREATE INDEX "StoreConversationChannelConfiguration_tenantId_desiredMode__idx" ON "StoreConversationChannelConfiguration"("tenantId", "desiredMode", "updatedAt");

-- CreateIndex
CREATE INDEX "StoreConversationChannelConfigurationCommand_tenantId_store_idx" ON "StoreConversationChannelConfigurationCommand"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationChannelConfigurationCommand_configurationI_key" ON "StoreConversationChannelConfigurationCommand"("configurationId", "clientOperationId");

-- CreateIndex
CREATE INDEX "StoreConversationChannelConfigurationAuditEvent_tenantId_st_idx" ON "StoreConversationChannelConfigurationAuditEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationChannelConfigurationAuditEvent_configurati_idx" ON "StoreConversationChannelConfigurationAuditEvent"("configurationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationChannelConfigurationAuditEvent_actorUserId_idx" ON "StoreConversationChannelConfigurationAuditEvent"("actorUserId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppBridgeCapability_tokenDigest_key" ON "StoreConversationWhatsAppBridgeCapability"("tokenDigest");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeCapability_tenantId_storeId__idx" ON "StoreConversationWhatsAppBridgeCapability"("tenantId", "storeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeCapability_connectionId_stat_idx" ON "StoreConversationWhatsAppBridgeCapability"("connectionId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeCapability_guestIdentityId_s_idx" ON "StoreConversationWhatsAppBridgeCapability"("guestIdentityId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeCapability_accountAccessId_s_idx" ON "StoreConversationWhatsAppBridgeCapability"("accountAccessId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppBridgeCapability_conversationId_cl_key" ON "StoreConversationWhatsAppBridgeCapability"("conversationId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppBridge_capabilityId_key" ON "StoreConversationWhatsAppBridge"("capabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppBridge_candidateId_key" ON "StoreConversationWhatsAppBridge"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppBridge_linkedMessageId_key" ON "StoreConversationWhatsAppBridge"("linkedMessageId");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridge_tenantId_storeId_status_upd_idx" ON "StoreConversationWhatsAppBridge"("tenantId", "storeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridge_conversationId_status_updat_idx" ON "StoreConversationWhatsAppBridge"("conversationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridge_connectionId_status_updated_idx" ON "StoreConversationWhatsAppBridge"("connectionId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppBridge_storeId_connectionId_extern_key" ON "StoreConversationWhatsAppBridge"("storeId", "connectionId", "externalCustomerIdDigest");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppBridgeChoiceCapability_tokenDigest_key" ON "StoreConversationWhatsAppBridgeChoiceCapability"("tokenDigest");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeChoiceCapability_tenantId_st_idx" ON "StoreConversationWhatsAppBridgeChoiceCapability"("tenantId", "storeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeChoiceCapability_bridgeId_st_idx" ON "StoreConversationWhatsAppBridgeChoiceCapability"("bridgeId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppBridgeChoiceCapability_bridgeId_br_key" ON "StoreConversationWhatsAppBridgeChoiceCapability"("bridgeId", "bridgeRevision", "choice");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeAttempt_tenantId_storeId_sta_idx" ON "StoreConversationWhatsAppBridgeAttempt"("tenantId", "storeId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeAttempt_connectionId_status__idx" ON "StoreConversationWhatsAppBridgeAttempt"("connectionId", "status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppBridgeAttempt_bridgeId_bridgeRevis_key" ON "StoreConversationWhatsAppBridgeAttempt"("bridgeId", "bridgeRevision");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeAuditEvent_tenantId_storeId__idx" ON "StoreConversationWhatsAppBridgeAuditEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeAuditEvent_conversationId_oc_idx" ON "StoreConversationWhatsAppBridgeAuditEvent"("conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeAuditEvent_bridgeId_occurred_idx" ON "StoreConversationWhatsAppBridgeAuditEvent"("bridgeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppBridgeAuditEvent_accountUserId_occ_idx" ON "StoreConversationWhatsAppBridgeAuditEvent"("accountUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationGuestNotificationContact_tenantId_storeId__idx" ON "StoreConversationGuestNotificationContact"("tenantId", "storeId", "guestIdentityId", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestNotificationContact_storeId_guestIden_key" ON "StoreConversationGuestNotificationContact"("storeId", "guestIdentityId", "channel", "destinationDigest");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppCandidate_inboundEventId_key" ON "StoreConversationWhatsAppCandidate"("inboundEventId");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidate_tenantId_storeId_status__idx" ON "StoreConversationWhatsAppCandidate"("tenantId", "storeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidate_connectionId_externalCus_idx" ON "StoreConversationWhatsAppCandidate"("connectionId", "externalCustomerIdDigest", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidate_storeId_notificationDest_idx" ON "StoreConversationWhatsAppCandidate"("storeId", "notificationDestinationDigest", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidate_conversationId_status_cr_idx" ON "StoreConversationWhatsAppCandidate"("conversationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidate_notificationContactId_st_idx" ON "StoreConversationWhatsAppCandidate"("notificationContactId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidate_accountAccessId_status_e_idx" ON "StoreConversationWhatsAppCandidate"("accountAccessId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppCandidateActionCapability_tokenDig_key" ON "StoreConversationWhatsAppCandidateActionCapability"("tokenDigest");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidateActionCapability_tenantId_idx" ON "StoreConversationWhatsAppCandidateActionCapability"("tenantId", "storeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidateActionCapability_candidat_idx" ON "StoreConversationWhatsAppCandidateActionCapability"("candidateId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppCandidateActionCapability_candidat_key" ON "StoreConversationWhatsAppCandidateActionCapability"("candidateId", "candidateRevision", "action");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppCandidateAttempt_candidateId_key" ON "StoreConversationWhatsAppCandidateAttempt"("candidateId");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidateAttempt_tenantId_storeId__idx" ON "StoreConversationWhatsAppCandidateAttempt"("tenantId", "storeId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidateAttempt_connectionId_stat_idx" ON "StoreConversationWhatsAppCandidateAttempt"("connectionId", "status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppCandidateAttempt_candidateId_candi_key" ON "StoreConversationWhatsAppCandidateAttempt"("candidateId", "candidateRevision");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidateSuppression_tenantId_stor_idx" ON "StoreConversationWhatsAppCandidateSuppression"("tenantId", "storeId", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppCandidateSuppression_connectionId__idx" ON "StoreConversationWhatsAppCandidateSuppression"("connectionId", "externalCustomerIdDigest", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppCandidateSuppression_storeId_conne_key" ON "StoreConversationWhatsAppCandidateSuppression"("storeId", "connectionId", "externalCustomerIdDigest", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppRecoveryAttempt_inboundEventId_key" ON "StoreConversationWhatsAppRecoveryAttempt"("inboundEventId");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppRecoveryAttempt_tenantId_storeId_s_idx" ON "StoreConversationWhatsAppRecoveryAttempt"("tenantId", "storeId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppRecoveryAttempt_connectionId_statu_idx" ON "StoreConversationWhatsAppRecoveryAttempt"("connectionId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppDirectSession_tenantId_storeId_sta_idx" ON "StoreConversationWhatsAppDirectSession"("tenantId", "storeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppDirectSession_conversationId_statu_idx" ON "StoreConversationWhatsAppDirectSession"("conversationId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppDirectSession_storeId_connectionId_key" ON "StoreConversationWhatsAppDirectSession"("storeId", "connectionId", "externalCustomerIdDigest");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppObservation_inboundEventId_key" ON "StoreConversationWhatsAppObservation"("inboundEventId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppObservation_messageId_key" ON "StoreConversationWhatsAppObservation"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppObservation_providerMessageDigest_key" ON "StoreConversationWhatsAppObservation"("providerMessageDigest");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppObservation_tenantId_storeId_statu_idx" ON "StoreConversationWhatsAppObservation"("tenantId", "storeId", "statusOccurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppObservation_conversationId_statusO_idx" ON "StoreConversationWhatsAppObservation"("conversationId", "statusOccurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppObservation_connectionId_statusOcc_idx" ON "StoreConversationWhatsAppObservation"("connectionId", "statusOccurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppObservationEvent_eventDigest_key" ON "StoreConversationWhatsAppObservationEvent"("eventDigest");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppObservationEvent_tenantId_storeId__idx" ON "StoreConversationWhatsAppObservationEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppObservationEvent_observationId_occ_idx" ON "StoreConversationWhatsAppObservationEvent"("observationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationWhatsAppOutboundAttempt_messageId_key" ON "StoreConversationWhatsAppOutboundAttempt"("messageId");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppOutboundAttempt_tenantId_storeId_s_idx" ON "StoreConversationWhatsAppOutboundAttempt"("tenantId", "storeId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppOutboundAttempt_connectionId_statu_idx" ON "StoreConversationWhatsAppOutboundAttempt"("connectionId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StoreConversationWhatsAppOutboundAttempt_conversationId_sta_idx" ON "StoreConversationWhatsAppOutboundAttempt"("conversationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestNotificationVerification_tokenDigest_key" ON "StoreConversationGuestNotificationVerification"("tokenDigest");

-- CreateIndex
CREATE INDEX "StoreConversationGuestNotificationVerification_tenantId_sto_idx" ON "StoreConversationGuestNotificationVerification"("tenantId", "storeId", "status", "nextAttemptAt", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationGuestNotificationVerification_guestIdentit_idx" ON "StoreConversationGuestNotificationVerification"("guestIdentityId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestNotificationVerification_guestIdentit_key" ON "StoreConversationGuestNotificationVerification"("guestIdentityId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAccountNotificationPreference_accountUserI_key" ON "StoreConversationAccountNotificationPreference"("accountUserId");

-- CreateIndex
CREATE INDEX "StoreConversationAccountNotificationPreference_accountUserI_idx" ON "StoreConversationAccountNotificationPreference"("accountUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "StoreConversationPushEndpoint_tenantId_storeId_conversation_idx" ON "StoreConversationPushEndpoint"("tenantId", "storeId", "conversationId", "status");

-- CreateIndex
CREATE INDEX "StoreConversationPushEndpoint_guestCredentialId_status_idx" ON "StoreConversationPushEndpoint"("guestCredentialId", "status");

-- CreateIndex
CREATE INDEX "StoreConversationPushEndpoint_accountUserId_status_idx" ON "StoreConversationPushEndpoint"("accountUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationPushEndpoint_conversationId_endpointDigest_key" ON "StoreConversationPushEndpoint"("conversationId", "endpointDigest");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationCommand_conversationId_created_idx" ON "StoreConversationNotificationCommand"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationCommand_accountUserId_createdA_idx" ON "StoreConversationNotificationCommand"("accountUserId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationCommand_guestCredentialId_crea_idx" ON "StoreConversationNotificationCommand"("guestCredentialId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationNotificationCommand_principalKey_clientOpe_key" ON "StoreConversationNotificationCommand"("principalKey", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationNotificationIntent_deduplicationKey_key" ON "StoreConversationNotificationIntent"("deduplicationKey");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationIntent_status_scheduledFor_nex_idx" ON "StoreConversationNotificationIntent"("status", "scheduledFor", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationIntent_tenantId_storeId_conver_idx" ON "StoreConversationNotificationIntent"("tenantId", "storeId", "conversationId", "kind", "status");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationIntent_coalescingKey_status_idx" ON "StoreConversationNotificationIntent"("coalescingKey", "status");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationIntent_guestIdentityId_status_idx" ON "StoreConversationNotificationIntent"("guestIdentityId", "status");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationIntent_accountUserId_status_idx" ON "StoreConversationNotificationIntent"("accountUserId", "status");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationAttempt_tenantId_storeId_start_idx" ON "StoreConversationNotificationAttempt"("tenantId", "storeId", "startedAt");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationAttempt_providerKey_providerOp_idx" ON "StoreConversationNotificationAttempt"("providerKey", "providerOperationDigest");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationNotificationAttempt_notificationIntentId_a_key" ON "StoreConversationNotificationAttempt"("notificationIntentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationReceipt_notificationIntentId_o_idx" ON "StoreConversationNotificationReceipt"("notificationIntentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationNotificationReceipt_tenantId_providerKey_p_key" ON "StoreConversationNotificationReceipt"("tenantId", "providerKey", "providerReceiptDigest");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationAuditEvent_tenantId_storeId_oc_idx" ON "StoreConversationNotificationAuditEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationAuditEvent_conversationId_occu_idx" ON "StoreConversationNotificationAuditEvent"("conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationNotificationAuditEvent_notificationIntentI_idx" ON "StoreConversationNotificationAuditEvent"("notificationIntentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestCredential_rotatedToCredentialId_key" ON "StoreConversationGuestCredential"("rotatedToCredentialId");

-- AddForeignKey
ALTER TABLE "StoreConversationGuestCredential" ADD CONSTRAINT "StoreConversationGuestCredential_rotatedToCredentialId_fkey" FOREIGN KEY ("rotatedToCredentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestCredentialRotation" ADD CONSTRAINT "StoreConversationGuestCredentialRotation_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestCredentialRotation" ADD CONSTRAINT "StoreConversationGuestCredentialRotation_sourceCredentialI_fkey" FOREIGN KEY ("sourceCredentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestCredentialRotation" ADD CONSTRAINT "StoreConversationGuestCredentialRotation_targetCredentialI_fkey" FOREIGN KEY ("targetCredentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationCommand" ADD CONSTRAINT "StoreConversationModerationCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationCommand" ADD CONSTRAINT "StoreConversationModerationCommand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationCommand" ADD CONSTRAINT "StoreConversationModerationCommand_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationCommand" ADD CONSTRAINT "StoreConversationModerationCommand_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationCommand" ADD CONSTRAINT "StoreConversationModerationCommand_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationAuditEvent" ADD CONSTRAINT "StoreConversationModerationAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationAuditEvent" ADD CONSTRAINT "StoreConversationModerationAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationAuditEvent" ADD CONSTRAINT "StoreConversationModerationAuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationAuditEvent" ADD CONSTRAINT "StoreConversationModerationAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationModerationAuditEvent" ADD CONSTRAINT "StoreConversationModerationAuditEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationSensitiveReadAuditEvent" ADD CONSTRAINT "StoreConversationSensitiveReadAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationSensitiveReadAuditEvent" ADD CONSTRAINT "StoreConversationSensitiveReadAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationSensitiveReadAuditEvent" ADD CONSTRAINT "StoreConversationSensitiveReadAuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationSensitiveReadAuditEvent" ADD CONSTRAINT "StoreConversationSensitiveReadAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationSensitiveReadAuditEvent" ADD CONSTRAINT "StoreConversationSensitiveReadAuditEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationSecurityChallenge" ADD CONSTRAINT "StoreConversationSecurityChallenge_securityEventId_fkey" FOREIGN KEY ("securityEventId") REFERENCES "StoreConversationSecurityEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPrivacyRequest" ADD CONSTRAINT "StoreConversationPrivacyRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPrivacyRequest" ADD CONSTRAINT "StoreConversationPrivacyRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPrivacyRequest" ADD CONSTRAINT "StoreConversationPrivacyRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPrivacyRequest" ADD CONSTRAINT "StoreConversationPrivacyRequest_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPrivacyRequest" ADD CONSTRAINT "StoreConversationPrivacyRequest_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPrivacyRequest" ADD CONSTRAINT "StoreConversationPrivacyRequest_proofChallengeId_fkey" FOREIGN KEY ("proofChallengeId") REFERENCES "StoreConversationSecurityChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPrivacyRequestClassification" ADD CONSTRAINT "StoreConversationPrivacyRequestClassification_privacyReque_fkey" FOREIGN KEY ("privacyRequestId") REFERENCES "StoreConversationPrivacyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPrivacyRequestOutcome" ADD CONSTRAINT "StoreConversationPrivacyRequestOutcome_privacyRequestId_fkey" FOREIGN KEY ("privacyRequestId") REFERENCES "StoreConversationPrivacyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountWatermark" ADD CONSTRAINT "StoreConversationAccountWatermark_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountWatermark" ADD CONSTRAINT "StoreConversationAccountWatermark_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountWatermark" ADD CONSTRAINT "StoreConversationAccountWatermark_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountWatermark" ADD CONSTRAINT "StoreConversationAccountWatermark_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfiguration" ADD CONSTRAINT "StoreConversationChannelConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfiguration" ADD CONSTRAINT "StoreConversationChannelConfiguration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfiguration" ADD CONSTRAINT "StoreConversationChannelConfiguration_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfigurationCommand" ADD CONSTRAINT "StoreConversationChannelConfigurationCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfigurationCommand" ADD CONSTRAINT "StoreConversationChannelConfigurationCommand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfigurationCommand" ADD CONSTRAINT "StoreConversationChannelConfigurationCommand_configuration_fkey" FOREIGN KEY ("configurationId") REFERENCES "StoreConversationChannelConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfigurationAuditEvent" ADD CONSTRAINT "StoreConversationChannelConfigurationAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfigurationAuditEvent" ADD CONSTRAINT "StoreConversationChannelConfigurationAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfigurationAuditEvent" ADD CONSTRAINT "StoreConversationChannelConfigurationAuditEvent_configurat_fkey" FOREIGN KEY ("configurationId") REFERENCES "StoreConversationChannelConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationChannelConfigurationAuditEvent" ADD CONSTRAINT "StoreConversationChannelConfigurationAuditEvent_actorUserI_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeCapability" ADD CONSTRAINT "StoreConversationWhatsAppBridgeCapability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeCapability" ADD CONSTRAINT "StoreConversationWhatsAppBridgeCapability_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeCapability" ADD CONSTRAINT "StoreConversationWhatsAppBridgeCapability_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeCapability" ADD CONSTRAINT "StoreConversationWhatsAppBridgeCapability_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeCapability" ADD CONSTRAINT "StoreConversationWhatsAppBridgeCapability_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeCapability" ADD CONSTRAINT "StoreConversationWhatsAppBridgeCapability_accountAccessId_fkey" FOREIGN KEY ("accountAccessId") REFERENCES "StoreConversationAccountAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridge" ADD CONSTRAINT "StoreConversationWhatsAppBridge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridge" ADD CONSTRAINT "StoreConversationWhatsAppBridge_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridge" ADD CONSTRAINT "StoreConversationWhatsAppBridge_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridge" ADD CONSTRAINT "StoreConversationWhatsAppBridge_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridge" ADD CONSTRAINT "StoreConversationWhatsAppBridge_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "StoreConversationWhatsAppBridgeCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridge" ADD CONSTRAINT "StoreConversationWhatsAppBridge_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "StoreConversationWhatsAppCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridge" ADD CONSTRAINT "StoreConversationWhatsAppBridge_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridge" ADD CONSTRAINT "StoreConversationWhatsAppBridge_accountAccessId_fkey" FOREIGN KEY ("accountAccessId") REFERENCES "StoreConversationAccountAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridge" ADD CONSTRAINT "StoreConversationWhatsAppBridge_linkedMessageId_fkey" FOREIGN KEY ("linkedMessageId") REFERENCES "StoreConversationMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeChoiceCapability" ADD CONSTRAINT "StoreConversationWhatsAppBridgeChoiceCapability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeChoiceCapability" ADD CONSTRAINT "StoreConversationWhatsAppBridgeChoiceCapability_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeChoiceCapability" ADD CONSTRAINT "StoreConversationWhatsAppBridgeChoiceCapability_bridgeId_fkey" FOREIGN KEY ("bridgeId") REFERENCES "StoreConversationWhatsAppBridge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAttempt" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAttempt" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAttempt" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAttempt_bridgeId_fkey" FOREIGN KEY ("bridgeId") REFERENCES "StoreConversationWhatsAppBridge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAttempt" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAttempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAuditEvent" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAuditEvent" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAuditEvent" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAuditEvent" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAuditEvent_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "StoreConversationWhatsAppBridgeCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAuditEvent" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAuditEvent_bridgeId_fkey" FOREIGN KEY ("bridgeId") REFERENCES "StoreConversationWhatsAppBridge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAuditEvent" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAuditEvent_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppBridgeAuditEvent" ADD CONSTRAINT "StoreConversationWhatsAppBridgeAuditEvent_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestNotificationContact" ADD CONSTRAINT "StoreConversationGuestNotificationContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestNotificationContact" ADD CONSTRAINT "StoreConversationGuestNotificationContact_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestNotificationContact" ADD CONSTRAINT "StoreConversationGuestNotificationContact_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidate" ADD CONSTRAINT "StoreConversationWhatsAppCandidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidate" ADD CONSTRAINT "StoreConversationWhatsAppCandidate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidate" ADD CONSTRAINT "StoreConversationWhatsAppCandidate_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidate" ADD CONSTRAINT "StoreConversationWhatsAppCandidate_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidate" ADD CONSTRAINT "StoreConversationWhatsAppCandidate_inboundEventId_fkey" FOREIGN KEY ("inboundEventId") REFERENCES "WhatsAppInboundEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidate" ADD CONSTRAINT "StoreConversationWhatsAppCandidate_notificationContactId_fkey" FOREIGN KEY ("notificationContactId") REFERENCES "StoreConversationGuestNotificationContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidate" ADD CONSTRAINT "StoreConversationWhatsAppCandidate_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidate" ADD CONSTRAINT "StoreConversationWhatsAppCandidate_accountAccessId_fkey" FOREIGN KEY ("accountAccessId") REFERENCES "StoreConversationAccountAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateActionCapability" ADD CONSTRAINT "StoreConversationWhatsAppCandidateActionCapability_tenantI_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateActionCapability" ADD CONSTRAINT "StoreConversationWhatsAppCandidateActionCapability_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateActionCapability" ADD CONSTRAINT "StoreConversationWhatsAppCandidateActionCapability_candida_fkey" FOREIGN KEY ("candidateId") REFERENCES "StoreConversationWhatsAppCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateAttempt" ADD CONSTRAINT "StoreConversationWhatsAppCandidateAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateAttempt" ADD CONSTRAINT "StoreConversationWhatsAppCandidateAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateAttempt" ADD CONSTRAINT "StoreConversationWhatsAppCandidateAttempt_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "StoreConversationWhatsAppCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateAttempt" ADD CONSTRAINT "StoreConversationWhatsAppCandidateAttempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateSuppression" ADD CONSTRAINT "StoreConversationWhatsAppCandidateSuppression_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateSuppression" ADD CONSTRAINT "StoreConversationWhatsAppCandidateSuppression_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateSuppression" ADD CONSTRAINT "StoreConversationWhatsAppCandidateSuppression_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateSuppression" ADD CONSTRAINT "StoreConversationWhatsAppCandidateSuppression_conversation_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppCandidateSuppression" ADD CONSTRAINT "StoreConversationWhatsAppCandidateSuppression_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "StoreConversationWhatsAppCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppRecoveryAttempt" ADD CONSTRAINT "StoreConversationWhatsAppRecoveryAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppRecoveryAttempt" ADD CONSTRAINT "StoreConversationWhatsAppRecoveryAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppRecoveryAttempt" ADD CONSTRAINT "StoreConversationWhatsAppRecoveryAttempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppRecoveryAttempt" ADD CONSTRAINT "StoreConversationWhatsAppRecoveryAttempt_inboundEventId_fkey" FOREIGN KEY ("inboundEventId") REFERENCES "WhatsAppInboundEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppDirectSession" ADD CONSTRAINT "StoreConversationWhatsAppDirectSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppDirectSession" ADD CONSTRAINT "StoreConversationWhatsAppDirectSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppDirectSession" ADD CONSTRAINT "StoreConversationWhatsAppDirectSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppDirectSession" ADD CONSTRAINT "StoreConversationWhatsAppDirectSession_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservation" ADD CONSTRAINT "StoreConversationWhatsAppObservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservation" ADD CONSTRAINT "StoreConversationWhatsAppObservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservation" ADD CONSTRAINT "StoreConversationWhatsAppObservation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservation" ADD CONSTRAINT "StoreConversationWhatsAppObservation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservation" ADD CONSTRAINT "StoreConversationWhatsAppObservation_inboundEventId_fkey" FOREIGN KEY ("inboundEventId") REFERENCES "WhatsAppInboundEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservation" ADD CONSTRAINT "StoreConversationWhatsAppObservation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StoreConversationMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservation" ADD CONSTRAINT "StoreConversationWhatsAppObservation_bridgeId_fkey" FOREIGN KEY ("bridgeId") REFERENCES "StoreConversationWhatsAppBridge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservation" ADD CONSTRAINT "StoreConversationWhatsAppObservation_directSessionId_fkey" FOREIGN KEY ("directSessionId") REFERENCES "StoreConversationWhatsAppDirectSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservationEvent" ADD CONSTRAINT "StoreConversationWhatsAppObservationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservationEvent" ADD CONSTRAINT "StoreConversationWhatsAppObservationEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppObservationEvent" ADD CONSTRAINT "StoreConversationWhatsAppObservationEvent_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "StoreConversationWhatsAppObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppOutboundAttempt" ADD CONSTRAINT "StoreConversationWhatsAppOutboundAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppOutboundAttempt" ADD CONSTRAINT "StoreConversationWhatsAppOutboundAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppOutboundAttempt" ADD CONSTRAINT "StoreConversationWhatsAppOutboundAttempt_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppOutboundAttempt" ADD CONSTRAINT "StoreConversationWhatsAppOutboundAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StoreConversationMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppOutboundAttempt" ADD CONSTRAINT "StoreConversationWhatsAppOutboundAttempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppOutboundAttempt" ADD CONSTRAINT "StoreConversationWhatsAppOutboundAttempt_bridgeId_fkey" FOREIGN KEY ("bridgeId") REFERENCES "StoreConversationWhatsAppBridge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationWhatsAppOutboundAttempt" ADD CONSTRAINT "StoreConversationWhatsAppOutboundAttempt_directSessionId_fkey" FOREIGN KEY ("directSessionId") REFERENCES "StoreConversationWhatsAppDirectSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestNotificationVerification" ADD CONSTRAINT "StoreConversationGuestNotificationVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestNotificationVerification" ADD CONSTRAINT "StoreConversationGuestNotificationVerification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestNotificationVerification" ADD CONSTRAINT "StoreConversationGuestNotificationVerification_conversatio_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestNotificationVerification" ADD CONSTRAINT "StoreConversationGuestNotificationVerification_guestIdenti_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestNotificationVerification" ADD CONSTRAINT "StoreConversationGuestNotificationVerification_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "StoreConversationGuestNotificationContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountNotificationPreference" ADD CONSTRAINT "StoreConversationAccountNotificationPreference_accountUser_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPushEndpoint" ADD CONSTRAINT "StoreConversationPushEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPushEndpoint" ADD CONSTRAINT "StoreConversationPushEndpoint_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPushEndpoint" ADD CONSTRAINT "StoreConversationPushEndpoint_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPushEndpoint" ADD CONSTRAINT "StoreConversationPushEndpoint_guestCredentialId_fkey" FOREIGN KEY ("guestCredentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationPushEndpoint" ADD CONSTRAINT "StoreConversationPushEndpoint_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationCommand" ADD CONSTRAINT "StoreConversationNotificationCommand_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationCommand" ADD CONSTRAINT "StoreConversationNotificationCommand_guestCredentialId_fkey" FOREIGN KEY ("guestCredentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationCommand" ADD CONSTRAINT "StoreConversationNotificationCommand_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationIntent" ADD CONSTRAINT "StoreConversationNotificationIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationIntent" ADD CONSTRAINT "StoreConversationNotificationIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationIntent" ADD CONSTRAINT "StoreConversationNotificationIntent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationIntent" ADD CONSTRAINT "StoreConversationNotificationIntent_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationIntent" ADD CONSTRAINT "StoreConversationNotificationIntent_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationIntent" ADD CONSTRAINT "StoreConversationNotificationIntent_targetMessageId_fkey" FOREIGN KEY ("targetMessageId") REFERENCES "StoreConversationMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationIntent" ADD CONSTRAINT "StoreConversationNotificationIntent_selectedContactId_fkey" FOREIGN KEY ("selectedContactId") REFERENCES "StoreConversationGuestNotificationContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationIntent" ADD CONSTRAINT "StoreConversationNotificationIntent_selectedPushEndpointId_fkey" FOREIGN KEY ("selectedPushEndpointId") REFERENCES "StoreConversationPushEndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationAttempt" ADD CONSTRAINT "StoreConversationNotificationAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationAttempt" ADD CONSTRAINT "StoreConversationNotificationAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationAttempt" ADD CONSTRAINT "StoreConversationNotificationAttempt_notificationIntentId_fkey" FOREIGN KEY ("notificationIntentId") REFERENCES "StoreConversationNotificationIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationReceipt" ADD CONSTRAINT "StoreConversationNotificationReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationReceipt" ADD CONSTRAINT "StoreConversationNotificationReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationReceipt" ADD CONSTRAINT "StoreConversationNotificationReceipt_notificationIntentId_fkey" FOREIGN KEY ("notificationIntentId") REFERENCES "StoreConversationNotificationIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationAuditEvent" ADD CONSTRAINT "StoreConversationNotificationAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationAuditEvent" ADD CONSTRAINT "StoreConversationNotificationAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationAuditEvent" ADD CONSTRAINT "StoreConversationNotificationAuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationAuditEvent" ADD CONSTRAINT "StoreConversationNotificationAuditEvent_notificationIntent_fkey" FOREIGN KEY ("notificationIntentId") REFERENCES "StoreConversationNotificationIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationAuditEvent" ADD CONSTRAINT "StoreConversationNotificationAuditEvent_actorAccountUserId_fkey" FOREIGN KEY ("actorAccountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationNotificationAuditEvent" ADD CONSTRAINT "StoreConversationNotificationAuditEvent_actorGuestIdentity_fkey" FOREIGN KEY ("actorGuestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
