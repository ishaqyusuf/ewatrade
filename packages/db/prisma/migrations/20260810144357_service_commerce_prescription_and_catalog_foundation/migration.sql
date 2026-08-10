-- CreateEnum
CREATE TYPE "CatalogSourceLineType" AS ENUM ('SERVICE_REQUEST', 'PRESCRIPTION_REQUEST', 'COMMERCE_INQUIRY');

-- CreateEnum
CREATE TYPE "CatalogAvailabilityAttestationType" AS ENUM ('TRACKED_IN_STOCK', 'MANUAL_PROCURE_TO_ORDER', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CatalogReusablePriceScope" AS ENUM ('TENANT');

-- CreateEnum
CREATE TYPE "QaDataClassification" AS ENUM ('LIVE', 'QA');

-- CreateEnum
CREATE TYPE "QaPurgeRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CommerceQuoteSourceType" AS ENUM ('SERVICE_REQUEST', 'PRESCRIPTION_REQUEST', 'COMMERCE_INQUIRY');

-- CreateEnum
CREATE TYPE "CommerceQuoteVersionStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CommerceQuoteAvailabilityOutcome" AS ENUM ('FULL', 'PARTIAL', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CommerceQuoteLineOutcome" AS ENUM ('INCLUDED', 'ALTERNATIVE', 'UNAVAILABLE', 'DECLINED');

-- CreateEnum
CREATE TYPE "CommerceQuoteFulfilmentType" AS ENUM ('UNSPECIFIED', 'PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "PrescriptionCommerceStoreStatus" AS ENUM ('DISABLED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PrescriptionStoreRoleType" AS ENUM ('ATTENDANT', 'PHARMACIST');

-- CreateEnum
CREATE TYPE "PrescriptionStoreRoleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PrescriptionStoreAuditEventType" AS ENUM ('SETTINGS_UPDATED', 'ROLE_ASSIGNED', 'ROLE_REVOKED', 'ACTIVATED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PrescriptionChannelStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PrescriptionRequestStatus" AS ENUM ('RECEIVED', 'MEDIA_REVIEW', 'NEEDS_CLEARER_MEDIA', 'TRANSCRIBING', 'ATTENDANT_VERIFICATION', 'PHARMACIST_REVIEW', 'NEEDS_CLARIFICATION', 'READY_TO_QUOTE', 'QUOTED', 'CONVERTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PrescriptionRequestSource" AS ENUM ('WEB', 'WHATSAPP', 'STAFF_WALK_IN', 'STAFF_PHONE');

-- CreateEnum
CREATE TYPE "PrescriptionFulfilmentPreference" AS ENUM ('UNSPECIFIED', 'PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "PrescriptionMediaStatus" AS ENUM ('PENDING', 'SAFE', 'QUARANTINED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "PrescriptionMediaAccessAction" AS ENUM ('UPLOADED', 'SCANNED', 'ACCESSED', 'QUARANTINED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "PrescriptionTranscriptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PrescriptionLineVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'UNREADABLE');

-- CreateEnum
CREATE TYPE "PrescriptionLineAvailability" AS ENUM ('AVAILABLE', 'PARTIAL', 'UNAVAILABLE', 'RESTRICTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PrescriptionPharmacistDecision" AS ENUM ('RELEASED', 'NEEDS_CLARIFICATION', 'DECLINED');

-- CreateEnum
CREATE TYPE "PrescriptionRequestAuditEventType" AS ENUM ('RECEIVED', 'STATUS_CHANGED', 'MEDIA_REVISION_CREATED', 'CLEARER_MEDIA_REQUESTED', 'TRANSCRIPTION_REQUESTED', 'TRANSCRIPTION_COMPLETED', 'LINE_VERIFIED', 'PHARMACIST_REVIEWED', 'QUOTE_ISSUED', 'CONVERTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HostedPaymentStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProviderEventOutcome" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrescriptionRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PrescriptionRefundProviderDispatchState" AS ENUM ('READY', 'OUTCOME_UNKNOWN', 'NEEDS_REVIEW', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PrescriptionPickupStatus" AS ENUM ('PREPARING', 'READY', 'HANDED_OFF', 'EXCEPTION', 'ABANDONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrescriptionPickupEventType" AS ENUM ('CREATED', 'PACKED', 'READY', 'CODE_FAILED', 'HANDED_OFF', 'EXCEPTION_RECORDED', 'ABANDONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrescriptionDeliveryZoneStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PrescriptionDeliveryZoneMatchType" AS ENUM ('POSTAL_PREFIX', 'LOCALITY');

-- CreateEnum
CREATE TYPE "PrescriptionDeliveryFeePolicy" AS ENUM ('FIXED', 'MANUAL');

-- CreateEnum
CREATE TYPE "DeliveryEligibilityStatus" AS ENUM ('ELIGIBLE', 'INELIGIBLE', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "PrescriptionDeliveryStatus" AS ENUM ('READY_FOR_ASSIGNMENT', 'ASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RESCHEDULED', 'RETURNED_TO_PHARMACY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrescriptionDeliveryEventType" AS ENUM ('CREATED', 'ASSIGNED', 'REASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RESCHEDULED', 'RETURNED_TO_PHARMACY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DRAFT', 'TESTING', 'ACTIVE', 'RECONNECTING', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "WhatsAppBindingStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WhatsAppInboundEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "PrescriptionCommunicationType" AS ENUM ('QUOTE_READY', 'CLARIFICATION', 'PAYMENT_RECEIPT', 'PICKUP_READY', 'DELIVERY_PROGRESS', 'DELIVERY_FAILED', 'EXPIRY');

-- CreateEnum
CREATE TYPE "CommunicationIntentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DEFERRED', 'FAILED');

-- CreateEnum
CREATE TYPE "CommunicationAttemptStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "PrescriptionQuickActionType" AS ENUM ('PICKUP', 'DELIVERY', 'ASK_PHARMACY', 'REVIEW_AND_PAY');

-- CreateEnum
CREATE TYPE "PrescriptionPrivacyRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'EXPORT', 'RESTRICTION', 'ERASURE');

-- CreateEnum
CREATE TYPE "PrescriptionPrivacyRequestStatus" AS ENUM ('PENDING', 'VERIFIED', 'PROCESSING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrescriptionIncidentType" AS ENUM ('SUSPEND_COMMERCE', 'FREEZE_PROCESSING', 'REVOKE_PUBLIC_LINKS', 'REVOKE_WHATSAPP', 'BREAK_GLASS');

-- CreateEnum
CREATE TYPE "PrescriptionIncidentStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PrescriptionUsageEventType" AS ENUM ('REQUEST_RECEIVED', 'QUOTE_ISSUED', 'ORDER_CREATED', 'PAYMENT_SUCCEEDED', 'MESSAGE_SENT', 'PICKUP_COMPLETED', 'DELIVERY_COMPLETED');

-- CreateEnum
CREATE TYPE "CommercialOrderReminderTiming" AS ENUM ('DAY_BEFORE', 'SAME_DAY');

-- CreateEnum
CREATE TYPE "CommercialOrderReminderDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ServiceCommerceProfileStatus" AS ENUM ('DISABLED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ServiceCommerceCatalogAdoptionMode" AS ENUM ('PROGRESSIVE', 'INVENTORY_MANAGED');

-- CreateEnum
CREATE TYPE "ServiceCommerceStoreAuditEventType" AS ENUM ('PROFILE_CREATED', 'SETTINGS_UPDATED', 'ACTIVATED', 'DEACTIVATED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CommerceInquiryStatus" AS ENUM ('RECEIVED', 'NEEDS_CLARIFICATION', 'READY_TO_QUOTE', 'QUOTED', 'CONVERTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommerceInquiryDemandReason" AS ENUM ('NEEDS_IDENTIFICATION', 'NEEDS_AVAILABILITY_CONFIRMATION', 'NEEDS_QUOTE');

-- CreateEnum
CREATE TYPE "CommerceInquiryChannelOrigin" AS ENUM ('WEB', 'STAFF', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CommerceInquiryAuditEventType" AS ENUM ('CREATED', 'STATE_CHANGED', 'QUOTE_ISSUED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "ServiceCommercePolicyVertical" AS ENUM ('SERVICE', 'PHARMACY');

-- CreateEnum
CREATE TYPE "ServiceCommercePolicyChannel" AS ENUM ('WEB', 'STAFF', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ServiceCommercePolicySubject" AS ENUM ('INTAKE', 'QUOTE', 'BOOKING', 'PAYMENT', 'PICKUP', 'DELIVERY', 'SERVICE_COMPLETION', 'WEB', 'STAFF', 'WHATSAPP', 'PROGRESSIVE_CATALOG', 'PROGRESSIVE_DRAFT_CAPTURE', 'CATALOG_PUBLICATION', 'PROCURE_TO_ORDER', 'PRICE_PROMOTION', 'MANAGED_INVENTORY_GRADUATION');

-- CreateEnum
CREATE TYPE "ServiceCommercePolicyOutcome" AS ENUM ('ALLOWED', 'RESTRICTED', 'PENDING_EVIDENCE', 'PROHIBITED');

-- CreateEnum
CREATE TYPE "ServiceCommercePolicyAuditEventType" AS ENUM ('READ', 'CREATED', 'UPDATED', 'REVOKED', 'OVERRIDE_DENIED');

-- AlterTable
ALTER TABLE "CommercialOrder" ADD COLUMN     "deliveryDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "dataClassification" "QaDataClassification" NOT NULL DEFAULT 'LIVE',
ADD COLUMN     "qaMarkedAt" TIMESTAMP(3),
ADD COLUMN     "qaPurgeStartedAt" TIMESTAMP(3),
ADD COLUMN     "qaSourceDomain" TEXT;

-- CreateTable
CREATE TABLE "QaPurgeRun" (
    "id" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "QaPurgeRunStatus" NOT NULL DEFAULT 'QUEUED',
    "activeKey" TEXT,
    "deletedCounts" JSONB,
    "errorCategory" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaPurgeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSourceLineLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceType" "CatalogSourceLineType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLineId" TEXT NOT NULL,
    "sourceVersionFingerprint" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "verifiedLabel" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSourceLineLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogVerifiedAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "sourceLinkId" TEXT,
    "normalizedAlias" TEXT NOT NULL,
    "displayAlias" TEXT NOT NULL,
    "verifiedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogVerifiedAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAvailabilityAttestation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceLinkId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "type" "CatalogAvailabilityAttestationType" NOT NULL,
    "sourceVersionFingerprint" TEXT NOT NULL,
    "quantity" DECIMAL(38,6),
    "configurationVersionId" TEXT,
    "balanceSourceId" TEXT,
    "balanceRevision" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "attestedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogAvailabilityAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogPricePromotion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceLinkId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "priceChangeId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "scope" "CatalogReusablePriceScope" NOT NULL DEFAULT 'TENANT',
    "previousPriceMinor" INTEGER,
    "priceMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "affectedStoreIds" TEXT[],
    "promotedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPricePromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceType" "CommerceQuoteSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "clientQuoteId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceQuoteVersion" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "clientVersionId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CommerceQuoteVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "availabilityOutcome" "CommerceQuoteAvailabilityOutcome" NOT NULL,
    "fulfilmentType" "CommerceQuoteFulfilmentType" NOT NULL DEFAULT 'UNSPECIFIED',
    "currencyCode" TEXT NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "fulfilmentFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "customerNote" TEXT,
    "fulfilmentPromise" TEXT,
    "acceptanceTokenDigest" TEXT,
    "expiresAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "acceptedOrderId" TEXT,
    "acceptanceClientId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceQuoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceQuoteReplayAccessToken" (
    "versionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceQuoteReplayAccessToken_pkey" PRIMARY KEY ("versionId")
);

-- CreateTable
CREATE TABLE "CommerceQuoteLine" (
    "id" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "sourceLineId" TEXT,
    "offeringId" TEXT,
    "outcome" "CommerceQuoteLineOutcome" NOT NULL DEFAULT 'INCLUDED',
    "catalogItemName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "optionSelections" JSONB NOT NULL,
    "offeringName" TEXT NOT NULL,
    "quantity" DECIMAL(38,6),
    "unitPriceMinor" INTEGER,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "customerNote" TEXT,
    "configurationVersionId" TEXT,
    "balanceRevision" INTEGER,
    "availabilityAttestationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrderFulfillmentCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "fulfilledLineCount" INTEGER NOT NULL,
    "resultStatus" "OrderStatus" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOrderFulfillmentCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrderReminderSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dayBeforeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sameDayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialOrderReminderSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrderReminderDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "timing" "CommercialOrderReminderTiming" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "status" "CommercialOrderReminderDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialOrderReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionStoreSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "PrescriptionCommerceStoreStatus" NOT NULL DEFAULT 'DISABLED',
    "operatingHours" JSONB,
    "servicePolicy" TEXT,
    "contactPolicy" TEXT,
    "consentVersion" TEXT,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "activatedByUserId" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionStoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionStoreRole" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PrescriptionStoreRoleType" NOT NULL,
    "status" "PrescriptionStoreRoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "credentialReference" TEXT,
    "credentialVerifiedAt" TIMESTAMP(3),
    "credentialVerifiedByUserId" TEXT,
    "assignedByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionStoreRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionStoreAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "type" "PrescriptionStoreAuditEventType" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "payload" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionStoreAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "PrescriptionChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "publicTokenDigest" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "webEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "staffEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channelId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "statusTokenDigest" TEXT,
    "statusTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "reuploadTokenDigest" TEXT,
    "reuploadTokenExpiresAt" TIMESTAMP(3),
    "status" "PrescriptionRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "source" "PrescriptionRequestSource" NOT NULL,
    "fulfilmentPreference" "PrescriptionFulfilmentPreference" NOT NULL DEFAULT 'UNSPECIFIED',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "consentVersion" TEXT NOT NULL,
    "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "sourceContext" JSONB,
    "currentMediaRevision" INTEGER NOT NULL DEFAULT 1,
    "currentTranscriptRevision" INTEGER,
    "clearerMediaReason" TEXT,
    "staffAssistedByUserId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "privacyRestrictedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionMedia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "clientMediaId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "PrescriptionMediaStatus" NOT NULL DEFAULT 'PENDING',
    "safetyMetadata" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionMediaAccessEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "action" "PrescriptionMediaAccessAction" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionMediaAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionTranscription" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "mediaRevision" INTEGER NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerOperationId" TEXT,
    "status" "PrescriptionTranscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionTranscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionTranscriptionLine" (
    "id" TEXT NOT NULL,
    "transcriptionId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "draftText" TEXT NOT NULL,
    "confidence" DECIMAL(5,4),
    "status" "PrescriptionLineVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedText" TEXT,
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionTranscriptionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionLineMapping" (
    "id" TEXT NOT NULL,
    "transcriptionLineId" TEXT NOT NULL,
    "offeringId" TEXT,
    "availability" "PrescriptionLineAvailability" NOT NULL,
    "quantity" DECIMAL(38,6),
    "configurationVersionId" TEXT,
    "balanceRevision" INTEGER,
    "isAlternative" BOOLEAN NOT NULL DEFAULT false,
    "customerWording" TEXT,
    "mappedByUserId" TEXT NOT NULL,
    "mappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionLineMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionPharmacistReview" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "mediaRevision" INTEGER NOT NULL,
    "transcriptRevision" INTEGER NOT NULL,
    "decision" "PrescriptionPharmacistDecision" NOT NULL,
    "reason" TEXT,
    "pharmacistUserId" TEXT NOT NULL,
    "pharmacistRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionPharmacistReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionRequestAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "PrescriptionRequestAuditEventType" NOT NULL,
    "actorUserId" TEXT,
    "fromStatus" "PrescriptionRequestStatus",
    "toStatus" "PrescriptionRequestStatus",
    "reason" TEXT,
    "payload" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionRequestAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionPaymentIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientPaymentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "statusTokenDigest" TEXT NOT NULL,
    "status" "HostedPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amountMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionPaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionPaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" "PaymentProviderEventOutcome" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PrescriptionPaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionPaymentRefund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "clientRefundId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PrescriptionRefundStatus" NOT NULL DEFAULT 'PENDING',
    "providerDispatchState" "PrescriptionRefundProviderDispatchState" NOT NULL DEFAULT 'READY',
    "providerDispatchCount" INTEGER NOT NULL DEFAULT 0,
    "providerDispatchClaimedAt" TIMESTAMP(3),
    "providerRefundId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionPaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionPickupFulfillment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "PrescriptionPickupStatus" NOT NULL DEFAULT 'PREPARING',
    "packingChecks" JSONB,
    "packedByUserId" TEXT,
    "packedAt" TIMESTAMP(3),
    "pickupCodeDigest" TEXT,
    "pickupCodeCiphertext" TEXT,
    "pickupCodeExpiresAt" TIMESTAMP(3),
    "failedCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "collectorName" TEXT,
    "collectorRelationship" TEXT,
    "handedOffByUserId" TEXT,
    "handedOffAt" TIMESTAMP(3),
    "exceptionCode" TEXT,
    "exceptionReason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionPickupFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionPickupEvent" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "type" "PrescriptionPickupEventType" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "payload" JSONB,
    "idempotencyKey" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionPickupEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionDeliveryZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PrescriptionDeliveryZoneStatus" NOT NULL DEFAULT 'ACTIVE',
    "matchType" "PrescriptionDeliveryZoneMatchType" NOT NULL,
    "matchValues" JSONB NOT NULL,
    "feePolicy" "PrescriptionDeliveryFeePolicy" NOT NULL,
    "fixedFeeMinor" INTEGER,
    "currencyCode" TEXT NOT NULL,
    "promiseText" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionDeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionDeliveryAddress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "quoteVersionId" TEXT NOT NULL,
    "zoneId" TEXT,
    "encryptedPayload" TEXT NOT NULL,
    "localityFingerprint" TEXT NOT NULL,
    "eligibilityStatus" "DeliveryEligibilityStatus" NOT NULL,
    "feeMinor" INTEGER,
    "promiseText" TEXT,
    "evaluatedByUserId" TEXT,
    "evaluationReason" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "packingChecks" JSONB,
    "packedByUserId" TEXT,
    "packedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionDeliveryAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionDeliveryAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerDeliveryId" TEXT,
    "status" "PrescriptionDeliveryStatus" NOT NULL DEFAULT 'READY_FOR_ASSIGNMENT',
    "courierReference" TEXT,
    "courierDisplayName" TEXT,
    "courierPhoneMasked" TEXT,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "proofReference" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionDeliveryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionDeliveryEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "type" "PrescriptionDeliveryEventType" NOT NULL,
    "actorUserId" TEXT,
    "idempotencyKey" TEXT,
    "reason" TEXT,
    "payload" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayNumber" TEXT NOT NULL,
    "businessDisplayName" TEXT,
    "billingOwner" TEXT,
    "testRecipient" TEXT,
    "credentialReference" TEXT NOT NULL,
    "pendingCredentialReference" TEXT,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DRAFT',
    "businessVerified" BOOLEAN NOT NULL DEFAULT false,
    "numberVerified" BOOLEAN NOT NULL DEFAULT false,
    "webhookSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "outboundVerified" BOOLEAN NOT NULL DEFAULT false,
    "templatesReady" BOOLEAN NOT NULL DEFAULT false,
    "templateConfiguration" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestFailureCode" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppStoreBinding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "status" "WhatsAppBindingStatus" NOT NULL DEFAULT 'PENDING',
    "boundByUserId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppStoreBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppInboundEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "externalCustomerId" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "normalizedPayload" JSONB NOT NULL,
    "status" "WhatsAppInboundEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "requestId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failureCode" TEXT,

    CONSTRAINT "WhatsAppInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppRoutingAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "connectionId" TEXT,
    "code" TEXT NOT NULL,
    "providerEventIdDigest" TEXT NOT NULL,
    "phoneNumberIdDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppRoutingAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConnectionAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "connectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "payload" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppConnectionAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppEmbeddedSignupSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicTokenDigest" TEXT NOT NULL,
    "credentialReference" TEXT NOT NULL,
    "discoveredNumbers" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppEmbeddedSignupSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionCommunicationIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" TEXT,
    "orderId" TEXT,
    "type" "PrescriptionCommunicationType" NOT NULL,
    "recipientReference" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "CommunicationIntentStatus" NOT NULL DEFAULT 'PENDING',
    "deduplicationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionCommunicationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionCommunicationAttempt" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "CommunicationAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "attemptNumber" INTEGER NOT NULL,
    "failureCode" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "PrescriptionCommunicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionQuickAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "PrescriptionQuickActionType" NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionQuickAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionRetentionPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "rawMediaDays" INTEGER NOT NULL DEFAULT 30,
    "transcriptDays" INTEGER NOT NULL DEFAULT 90,
    "messageDays" INTEGER NOT NULL DEFAULT 90,
    "secureTokenDays" INTEGER NOT NULL DEFAULT 30,
    "addressDays" INTEGER NOT NULL DEFAULT 30,
    "commercialRecordDays" INTEGER NOT NULL DEFAULT 2555,
    "auditEvidenceDays" INTEGER NOT NULL DEFAULT 2555,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionRetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionPrivacyRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "PrescriptionPrivacyRequestType" NOT NULL,
    "status" "PrescriptionPrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "subjectReference" TEXT NOT NULL,
    "identityVerifiedAt" TIMESTAMP(3),
    "identityVerifiedByUserId" TEXT,
    "identityVerificationEvidence" TEXT,
    "reason" TEXT NOT NULL,
    "requestedChanges" JSONB,
    "requestedByUserId" TEXT NOT NULL,
    "completedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "resultReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionPrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionIncidentControl" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "PrescriptionIncidentType" NOT NULL,
    "status" "PrescriptionIncidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "activatedByUserId" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionIncidentControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionSensitiveAccessEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" TEXT,
    "incidentControlId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "accessType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionSensitiveAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionUsageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "eventType" "PrescriptionUsageEventType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "dimensions" JSONB,
    "amounts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceStoreProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "ServiceCommerceProfileStatus" NOT NULL DEFAULT 'DISABLED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "catalogAdoptionMode" "ServiceCommerceCatalogAdoptionMode" NOT NULL DEFAULT 'PROGRESSIVE',
    "intakeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quoteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "paymentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "serviceCompletionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "webEnabled" BOOLEAN NOT NULL DEFAULT false,
    "staffEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "progressiveCatalogEnabled" BOOLEAN NOT NULL DEFAULT false,
    "procureToOrderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "policyRestrictedCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activatedAt" TIMESTAMP(3),
    "activatedByUserId" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCommerceStoreProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceStoreAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "ServiceCommerceStoreAuditEventType" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousSnapshot" JSONB,
    "currentSnapshot" JSONB NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceStoreAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommercePolicyDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "vertical" "ServiceCommercePolicyVertical" NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "channel" "ServiceCommercePolicyChannel" NOT NULL,
    "subject" "ServiceCommercePolicySubject" NOT NULL,
    "outcome" "ServiceCommercePolicyOutcome" NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "licenceReference" TEXT,
    "approvalReference" TEXT,
    "reviewedByUserId" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCommercePolicyDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommercePolicyAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "decisionId" TEXT,
    "type" "ServiceCommercePolicyAuditEventType" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "vertical" "ServiceCommercePolicyVertical" NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "channel" "ServiceCommercePolicyChannel" NOT NULL,
    "subject" "ServiceCommercePolicySubject" NOT NULL,
    "observedOutcome" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "decisionRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommercePolicyAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceInquiry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "clientInquiryId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "CommerceInquiryStatus" NOT NULL DEFAULT 'RECEIVED',
    "vertical" "ServiceCommercePolicyVertical" NOT NULL DEFAULT 'SERVICE',
    "demandReason" "CommerceInquiryDemandReason" NOT NULL,
    "channelOrigin" "CommerceInquiryChannelOrigin" NOT NULL,
    "summary" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceInquiryLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestedQuantity" DECIMAL(38,6),
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceInquiryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceInquiryAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "type" "CommerceInquiryAuditEventType" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromStatus" "CommerceInquiryStatus",
    "toStatus" "CommerceInquiryStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceInquiryAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QaPurgeRun_activeKey_key" ON "QaPurgeRun"("activeKey");

-- CreateIndex
CREATE INDEX "QaPurgeRun_status_idx" ON "QaPurgeRun"("status");

-- CreateIndex
CREATE INDEX "QaPurgeRun_createdAt_idx" ON "QaPurgeRun"("createdAt");

-- CreateIndex
CREATE INDEX "CatalogSourceLineLink_tenantId_storeId_createdAt_idx" ON "CatalogSourceLineLink"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogSourceLineLink_offeringId_createdAt_idx" ON "CatalogSourceLineLink"("offeringId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSourceLineLink_tenantId_clientOperationId_key" ON "CatalogSourceLineLink"("tenantId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSourceLineLink_tenantId_storeId_sourceType_sourceId__key" ON "CatalogSourceLineLink"("tenantId", "storeId", "sourceType", "sourceId", "sourceLineId");

-- CreateIndex
CREATE INDEX "CatalogVerifiedAlias_tenantId_storeId_normalizedAlias_idx" ON "CatalogVerifiedAlias"("tenantId", "storeId", "normalizedAlias");

-- CreateIndex
CREATE INDEX "CatalogVerifiedAlias_sourceLinkId_createdAt_idx" ON "CatalogVerifiedAlias"("sourceLinkId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogVerifiedAlias_tenantId_storeId_offeringId_normalized_key" ON "CatalogVerifiedAlias"("tenantId", "storeId", "offeringId", "normalizedAlias");

-- CreateIndex
CREATE INDEX "CatalogAvailabilityAttestation_tenantId_storeId_createdAt_idx" ON "CatalogAvailabilityAttestation"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogAvailabilityAttestation_sourceLinkId_supersededAt_cr_idx" ON "CatalogAvailabilityAttestation"("sourceLinkId", "supersededAt", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogAvailabilityAttestation_offeringId_expiresAt_idx" ON "CatalogAvailabilityAttestation"("offeringId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAvailabilityAttestation_tenantId_clientOperationId_key" ON "CatalogAvailabilityAttestation"("tenantId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPricePromotion_priceChangeId_key" ON "CatalogPricePromotion"("priceChangeId");

-- CreateIndex
CREATE INDEX "CatalogPricePromotion_tenantId_storeId_createdAt_idx" ON "CatalogPricePromotion"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogPricePromotion_sourceLinkId_createdAt_idx" ON "CatalogPricePromotion"("sourceLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogPricePromotion_offeringId_createdAt_idx" ON "CatalogPricePromotion"("offeringId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogPricePromotion_quoteVersionId_createdAt_idx" ON "CatalogPricePromotion"("quoteVersionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPricePromotion_tenantId_clientOperationId_key" ON "CatalogPricePromotion"("tenantId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuote_currentVersionId_key" ON "CommerceQuote"("currentVersionId");

-- CreateIndex
CREATE INDEX "CommerceQuote_tenantId_storeId_createdAt_idx" ON "CommerceQuote"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceQuote_sourceType_sourceId_idx" ON "CommerceQuote"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuote_tenantId_clientQuoteId_key" ON "CommerceQuote"("tenantId", "clientQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuote_tenantId_sourceType_sourceId_key" ON "CommerceQuote"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuoteVersion_acceptanceTokenDigest_key" ON "CommerceQuoteVersion"("acceptanceTokenDigest");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuoteVersion_acceptedOrderId_key" ON "CommerceQuoteVersion"("acceptedOrderId");

-- CreateIndex
CREATE INDEX "CommerceQuoteVersion_status_expiresAt_idx" ON "CommerceQuoteVersion"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CommerceQuoteVersion_acceptedOrderId_idx" ON "CommerceQuoteVersion"("acceptedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuoteVersion_quoteId_version_key" ON "CommerceQuoteVersion"("quoteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuoteVersion_quoteId_clientVersionId_key" ON "CommerceQuoteVersion"("quoteId", "clientVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuoteReplayAccessToken_tokenDigest_key" ON "CommerceQuoteReplayAccessToken"("tokenDigest");

-- CreateIndex
CREATE INDEX "CommerceQuoteReplayAccessToken_tenantId_storeId_updatedAt_idx" ON "CommerceQuoteReplayAccessToken"("tenantId", "storeId", "updatedAt");

-- CreateIndex
CREATE INDEX "CommerceQuoteLine_quoteVersionId_idx" ON "CommerceQuoteLine"("quoteVersionId");

-- CreateIndex
CREATE INDEX "CommerceQuoteLine_offeringId_idx" ON "CommerceQuoteLine"("offeringId");

-- CreateIndex
CREATE INDEX "CommerceQuoteLine_sourceLineId_idx" ON "CommerceQuoteLine"("sourceLineId");

-- CreateIndex
CREATE INDEX "CommerceQuoteLine_availabilityAttestationId_idx" ON "CommerceQuoteLine"("availabilityAttestationId");

-- CreateIndex
CREATE INDEX "CommercialOrderFulfillmentCommand_orderId_createdAt_idx" ON "CommercialOrderFulfillmentCommand"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderFulfillmentCommand_tenantId_clientOperationI_key" ON "CommercialOrderFulfillmentCommand"("tenantId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderReminderSettings_storeId_key" ON "CommercialOrderReminderSettings"("storeId");

-- CreateIndex
CREATE INDEX "CommercialOrderReminderSettings_tenantId_idx" ON "CommercialOrderReminderSettings"("tenantId");

-- CreateIndex
CREATE INDEX "CommercialOrderReminderDelivery_tenantId_status_createdAt_idx" ON "CommercialOrderReminderDelivery"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialOrderReminderDelivery_storeId_timing_createdAt_idx" ON "CommercialOrderReminderDelivery"("storeId", "timing", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderReminderDelivery_orderId_timing_recipientEma_key" ON "CommercialOrderReminderDelivery"("orderId", "timing", "recipientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionStoreSettings_storeId_key" ON "PrescriptionStoreSettings"("storeId");

-- CreateIndex
CREATE INDEX "PrescriptionStoreSettings_tenantId_status_updatedAt_idx" ON "PrescriptionStoreSettings"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PrescriptionStoreRole_tenantId_storeId_status_role_idx" ON "PrescriptionStoreRole"("tenantId", "storeId", "status", "role");

-- CreateIndex
CREATE INDEX "PrescriptionStoreRole_userId_status_idx" ON "PrescriptionStoreRole"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionStoreRole_storeId_userId_role_key" ON "PrescriptionStoreRole"("storeId", "userId", "role");

-- CreateIndex
CREATE INDEX "PrescriptionStoreAuditEvent_tenantId_storeId_effectiveAt_idx" ON "PrescriptionStoreAuditEvent"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PrescriptionStoreAuditEvent_settingsId_effectiveAt_idx" ON "PrescriptionStoreAuditEvent"("settingsId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PrescriptionStoreAuditEvent_actorUserId_effectiveAt_idx" ON "PrescriptionStoreAuditEvent"("actorUserId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionChannel_storeId_key" ON "PrescriptionChannel"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionChannel_publicTokenDigest_key" ON "PrescriptionChannel"("publicTokenDigest");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionChannel_publicToken_key" ON "PrescriptionChannel"("publicToken");

-- CreateIndex
CREATE INDEX "PrescriptionChannel_tenantId_status_idx" ON "PrescriptionChannel"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionRequest_statusTokenDigest_key" ON "PrescriptionRequest"("statusTokenDigest");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionRequest_reuploadTokenDigest_key" ON "PrescriptionRequest"("reuploadTokenDigest");

-- CreateIndex
CREATE INDEX "PrescriptionRequest_tenantId_storeId_status_createdAt_idx" ON "PrescriptionRequest"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PrescriptionRequest_tenantId_storeId_source_createdAt_idx" ON "PrescriptionRequest"("tenantId", "storeId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "PrescriptionRequest_channelId_createdAt_idx" ON "PrescriptionRequest"("channelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionRequest_tenantId_clientRequestId_key" ON "PrescriptionRequest"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionRequest_tenantId_reference_key" ON "PrescriptionRequest"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "PrescriptionMedia_tenantId_storeId_status_createdAt_idx" ON "PrescriptionMedia"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PrescriptionMedia_requestId_revision_pageNumber_idx" ON "PrescriptionMedia"("requestId", "revision", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionMedia_tenantId_clientMediaId_key" ON "PrescriptionMedia"("tenantId", "clientMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionMedia_requestId_revision_pageNumber_key" ON "PrescriptionMedia"("requestId", "revision", "pageNumber");

-- CreateIndex
CREATE INDEX "PrescriptionMediaAccessEvent_mediaId_effectiveAt_idx" ON "PrescriptionMediaAccessEvent"("mediaId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PrescriptionMediaAccessEvent_tenantId_storeId_effectiveAt_idx" ON "PrescriptionMediaAccessEvent"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PrescriptionTranscription_status_requestedAt_idx" ON "PrescriptionTranscription"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "PrescriptionTranscription_requestId_mediaRevision_idx" ON "PrescriptionTranscription"("requestId", "mediaRevision");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionTranscription_requestId_revision_key" ON "PrescriptionTranscription"("requestId", "revision");

-- CreateIndex
CREATE INDEX "PrescriptionTranscriptionLine_status_createdAt_idx" ON "PrescriptionTranscriptionLine"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionTranscriptionLine_transcriptionId_lineNumber_key" ON "PrescriptionTranscriptionLine"("transcriptionId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionLineMapping_transcriptionLineId_key" ON "PrescriptionLineMapping"("transcriptionLineId");

-- CreateIndex
CREATE INDEX "PrescriptionLineMapping_offeringId_idx" ON "PrescriptionLineMapping"("offeringId");

-- CreateIndex
CREATE INDEX "PrescriptionLineMapping_availability_mappedAt_idx" ON "PrescriptionLineMapping"("availability", "mappedAt");

-- CreateIndex
CREATE INDEX "PrescriptionPharmacistReview_requestId_createdAt_idx" ON "PrescriptionPharmacistReview"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "PrescriptionPharmacistReview_pharmacistUserId_createdAt_idx" ON "PrescriptionPharmacistReview"("pharmacistUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PrescriptionRequestAuditEvent_requestId_effectiveAt_idx" ON "PrescriptionRequestAuditEvent"("requestId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PrescriptionRequestAuditEvent_tenantId_storeId_effectiveAt_idx" ON "PrescriptionRequestAuditEvent"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionPaymentIntent_providerReference_key" ON "PrescriptionPaymentIntent"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionPaymentIntent_statusTokenDigest_key" ON "PrescriptionPaymentIntent"("statusTokenDigest");

-- CreateIndex
CREATE INDEX "PrescriptionPaymentIntent_tenantId_storeId_status_createdAt_idx" ON "PrescriptionPaymentIntent"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PrescriptionPaymentIntent_orderId_status_idx" ON "PrescriptionPaymentIntent"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionPaymentIntent_tenantId_clientPaymentId_key" ON "PrescriptionPaymentIntent"("tenantId", "clientPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionPaymentProviderEvent_providerEventId_key" ON "PrescriptionPaymentProviderEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PrescriptionPaymentProviderEvent_paymentIntentId_receivedAt_idx" ON "PrescriptionPaymentProviderEvent"("paymentIntentId", "receivedAt");

-- CreateIndex
CREATE INDEX "PrescriptionPaymentProviderEvent_provider_outcome_receivedA_idx" ON "PrescriptionPaymentProviderEvent"("provider", "outcome", "receivedAt");

-- CreateIndex
CREATE INDEX "PrescriptionPaymentRefund_paymentIntentId_status_requestedA_idx" ON "PrescriptionPaymentRefund"("paymentIntentId", "status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionPaymentRefund_tenantId_clientRefundId_key" ON "PrescriptionPaymentRefund"("tenantId", "clientRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionPickupFulfillment_orderId_key" ON "PrescriptionPickupFulfillment"("orderId");

-- CreateIndex
CREATE INDEX "PrescriptionPickupFulfillment_tenantId_storeId_status_updat_idx" ON "PrescriptionPickupFulfillment"("tenantId", "storeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PrescriptionPickupEvent_fulfillmentId_effectiveAt_idx" ON "PrescriptionPickupEvent"("fulfillmentId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionPickupEvent_fulfillmentId_idempotencyKey_key" ON "PrescriptionPickupEvent"("fulfillmentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PrescriptionDeliveryZone_tenantId_storeId_status_priority_idx" ON "PrescriptionDeliveryZone"("tenantId", "storeId", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionDeliveryZone_storeId_name_key" ON "PrescriptionDeliveryZone"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionDeliveryAddress_orderId_key" ON "PrescriptionDeliveryAddress"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionDeliveryAddress_quoteVersionId_key" ON "PrescriptionDeliveryAddress"("quoteVersionId");

-- CreateIndex
CREATE INDEX "PrescriptionDeliveryAddress_tenantId_storeId_eligibilitySta_idx" ON "PrescriptionDeliveryAddress"("tenantId", "storeId", "eligibilityStatus", "evaluatedAt");

-- CreateIndex
CREATE INDEX "PrescriptionDeliveryAddress_localityFingerprint_idx" ON "PrescriptionDeliveryAddress"("localityFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionDeliveryAssignment_orderId_key" ON "PrescriptionDeliveryAssignment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionDeliveryAssignment_addressId_key" ON "PrescriptionDeliveryAssignment"("addressId");

-- CreateIndex
CREATE INDEX "PrescriptionDeliveryAssignment_tenantId_storeId_status_upda_idx" ON "PrescriptionDeliveryAssignment"("tenantId", "storeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PrescriptionDeliveryEvent_assignmentId_effectiveAt_idx" ON "PrescriptionDeliveryEvent"("assignmentId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionDeliveryEvent_assignmentId_idempotencyKey_key" ON "PrescriptionDeliveryEvent"("assignmentId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_phoneNumberId_key" ON "WhatsAppConnection"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_tenantId_status_updatedAt_idx" ON "WhatsAppConnection"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_tenantId_wabaId_phoneNumberId_key" ON "WhatsAppConnection"("tenantId", "wabaId", "phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppStoreBinding_tenantId_connectionId_status_idx" ON "WhatsAppStoreBinding"("tenantId", "connectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppStoreBinding_connectionId_storeId_key" ON "WhatsAppStoreBinding"("connectionId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInboundEvent_providerEventId_key" ON "WhatsAppInboundEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "WhatsAppInboundEvent_tenantId_storeId_receivedAt_idx" ON "WhatsAppInboundEvent"("tenantId", "storeId", "receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppInboundEvent_connectionId_externalCustomerId_receiv_idx" ON "WhatsAppInboundEvent"("connectionId", "externalCustomerId", "receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppInboundEvent_status_receivedAt_idx" ON "WhatsAppInboundEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppRoutingAlert_providerEventIdDigest_key" ON "WhatsAppRoutingAlert"("providerEventIdDigest");

-- CreateIndex
CREATE INDEX "WhatsAppRoutingAlert_tenantId_connectionId_createdAt_idx" ON "WhatsAppRoutingAlert"("tenantId", "connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppRoutingAlert_code_createdAt_idx" ON "WhatsAppRoutingAlert"("code", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppConnectionAuditEvent_tenantId_storeId_effectiveAt_idx" ON "WhatsAppConnectionAuditEvent"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "WhatsAppConnectionAuditEvent_connectionId_effectiveAt_idx" ON "WhatsAppConnectionAuditEvent"("connectionId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppEmbeddedSignupSession_publicTokenDigest_key" ON "WhatsAppEmbeddedSignupSession"("publicTokenDigest");

-- CreateIndex
CREATE INDEX "WhatsAppEmbeddedSignupSession_tenantId_storeId_expiresAt_idx" ON "WhatsAppEmbeddedSignupSession"("tenantId", "storeId", "expiresAt");

-- CreateIndex
CREATE INDEX "PrescriptionCommunicationIntent_tenantId_storeId_status_cre_idx" ON "PrescriptionCommunicationIntent"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionCommunicationIntent_tenantId_deduplicationKey_key" ON "PrescriptionCommunicationIntent"("tenantId", "deduplicationKey");

-- CreateIndex
CREATE INDEX "PrescriptionCommunicationAttempt_providerMessageId_idx" ON "PrescriptionCommunicationAttempt"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionCommunicationAttempt_intentId_attemptNumber_key" ON "PrescriptionCommunicationAttempt"("intentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionQuickAction_tokenDigest_key" ON "PrescriptionQuickAction"("tokenDigest");

-- CreateIndex
CREATE INDEX "PrescriptionQuickAction_tenantId_storeId_entityType_entityI_idx" ON "PrescriptionQuickAction"("tenantId", "storeId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionRetentionPolicy_storeId_key" ON "PrescriptionRetentionPolicy"("storeId");

-- CreateIndex
CREATE INDEX "PrescriptionRetentionPolicy_tenantId_updatedAt_idx" ON "PrescriptionRetentionPolicy"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "PrescriptionPrivacyRequest_tenantId_storeId_status_createdA_idx" ON "PrescriptionPrivacyRequest"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PrescriptionIncidentControl_tenantId_storeId_status_activat_idx" ON "PrescriptionIncidentControl"("tenantId", "storeId", "status", "activatedAt");

-- CreateIndex
CREATE INDEX "PrescriptionSensitiveAccessEvent_tenantId_storeId_effective_idx" ON "PrescriptionSensitiveAccessEvent"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PrescriptionSensitiveAccessEvent_requestId_effectiveAt_idx" ON "PrescriptionSensitiveAccessEvent"("requestId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PrescriptionSensitiveAccessEvent_incidentControlId_effectiv_idx" ON "PrescriptionSensitiveAccessEvent"("incidentControlId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PrescriptionUsageEvent_tenantId_storeId_eventType_occurredA_idx" ON "PrescriptionUsageEvent"("tenantId", "storeId", "eventType", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionUsageEvent_tenantId_deduplicationKey_key" ON "PrescriptionUsageEvent"("tenantId", "deduplicationKey");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceStoreProfile_storeId_key" ON "ServiceCommerceStoreProfile"("storeId");

-- CreateIndex
CREATE INDEX "ServiceCommerceStoreProfile_tenantId_status_updatedAt_idx" ON "ServiceCommerceStoreProfile"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceStoreAuditEvent_tenantId_storeId_effectiveAt_idx" ON "ServiceCommerceStoreAuditEvent"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceStoreAuditEvent_profileId_effectiveAt_idx" ON "ServiceCommerceStoreAuditEvent"("profileId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceStoreAuditEvent_actorUserId_effectiveAt_idx" ON "ServiceCommerceStoreAuditEvent"("actorUserId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceCommercePolicyDecision_tenantId_storeId_expiresAt_idx" ON "ServiceCommercePolicyDecision"("tenantId", "storeId", "expiresAt");

-- CreateIndex
CREATE INDEX "ServiceCommercePolicyDecision_reviewedByUserId_updatedAt_idx" ON "ServiceCommercePolicyDecision"("reviewedByUserId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommercePolicyDecision_tenantId_storeId_vertical_jur_key" ON "ServiceCommercePolicyDecision"("tenantId", "storeId", "vertical", "jurisdictionCode", "channel", "subject");

-- CreateIndex
CREATE INDEX "ServiceCommercePolicyAuditEvent_tenantId_storeId_createdAt_idx" ON "ServiceCommercePolicyAuditEvent"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommercePolicyAuditEvent_decisionId_createdAt_idx" ON "ServiceCommercePolicyAuditEvent"("decisionId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommercePolicyAuditEvent_actorUserId_createdAt_idx" ON "ServiceCommercePolicyAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceInquiry_tenantId_storeId_status_createdAt_idx" ON "CommerceInquiry"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceInquiry_tenantId_clientInquiryId_key" ON "CommerceInquiry"("tenantId", "clientInquiryId");

-- CreateIndex
CREATE INDEX "CommerceInquiryLine_tenantId_storeId_createdAt_idx" ON "CommerceInquiryLine"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceInquiryLine_inquiryId_createdAt_idx" ON "CommerceInquiryLine"("inquiryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceInquiryLine_inquiryId_position_key" ON "CommerceInquiryLine"("inquiryId", "position");

-- CreateIndex
CREATE INDEX "CommerceInquiryAuditEvent_tenantId_storeId_createdAt_idx" ON "CommerceInquiryAuditEvent"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceInquiryAuditEvent_inquiryId_createdAt_idx" ON "CommerceInquiryAuditEvent"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceInquiryAuditEvent_actorUserId_createdAt_idx" ON "CommerceInquiryAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialOrder_tenantId_deliveryDueAt_status_idx" ON "CommercialOrder"("tenantId", "deliveryDueAt", "status");

-- AddForeignKey
ALTER TABLE "CatalogSourceLineLink" ADD CONSTRAINT "CatalogSourceLineLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSourceLineLink" ADD CONSTRAINT "CatalogSourceLineLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSourceLineLink" ADD CONSTRAINT "CatalogSourceLineLink_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVerifiedAlias" ADD CONSTRAINT "CatalogVerifiedAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVerifiedAlias" ADD CONSTRAINT "CatalogVerifiedAlias_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVerifiedAlias" ADD CONSTRAINT "CatalogVerifiedAlias_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVerifiedAlias" ADD CONSTRAINT "CatalogVerifiedAlias_sourceLinkId_fkey" FOREIGN KEY ("sourceLinkId") REFERENCES "CatalogSourceLineLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAvailabilityAttestation" ADD CONSTRAINT "CatalogAvailabilityAttestation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAvailabilityAttestation" ADD CONSTRAINT "CatalogAvailabilityAttestation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAvailabilityAttestation" ADD CONSTRAINT "CatalogAvailabilityAttestation_sourceLinkId_fkey" FOREIGN KEY ("sourceLinkId") REFERENCES "CatalogSourceLineLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAvailabilityAttestation" ADD CONSTRAINT "CatalogAvailabilityAttestation_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAvailabilityAttestation" ADD CONSTRAINT "CatalogAvailabilityAttestation_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "UnitConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAvailabilityAttestation" ADD CONSTRAINT "CatalogAvailabilityAttestation_balanceSourceId_fkey" FOREIGN KEY ("balanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPricePromotion" ADD CONSTRAINT "CatalogPricePromotion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPricePromotion" ADD CONSTRAINT "CatalogPricePromotion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPricePromotion" ADD CONSTRAINT "CatalogPricePromotion_sourceLinkId_fkey" FOREIGN KEY ("sourceLinkId") REFERENCES "CatalogSourceLineLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPricePromotion" ADD CONSTRAINT "CatalogPricePromotion_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPricePromotion" ADD CONSTRAINT "CatalogPricePromotion_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPricePromotion" ADD CONSTRAINT "CatalogPricePromotion_priceChangeId_fkey" FOREIGN KEY ("priceChangeId") REFERENCES "CatalogPriceChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuote" ADD CONSTRAINT "CommerceQuote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuote" ADD CONSTRAINT "CommerceQuote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuote" ADD CONSTRAINT "CommerceQuote_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteVersion" ADD CONSTRAINT "CommerceQuoteVersion_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "CommerceQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteVersion" ADD CONSTRAINT "CommerceQuoteVersion_acceptedOrderId_fkey" FOREIGN KEY ("acceptedOrderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteReplayAccessToken" ADD CONSTRAINT "CommerceQuoteReplayAccessToken_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteReplayAccessToken" ADD CONSTRAINT "CommerceQuoteReplayAccessToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteReplayAccessToken" ADD CONSTRAINT "CommerceQuoteReplayAccessToken_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteLine" ADD CONSTRAINT "CommerceQuoteLine_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteLine" ADD CONSTRAINT "CommerceQuoteLine_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteLine" ADD CONSTRAINT "CommerceQuoteLine_availabilityAttestationId_fkey" FOREIGN KEY ("availabilityAttestationId") REFERENCES "CatalogAvailabilityAttestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderFulfillmentCommand" ADD CONSTRAINT "CommercialOrderFulfillmentCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderFulfillmentCommand" ADD CONSTRAINT "CommercialOrderFulfillmentCommand_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderReminderSettings" ADD CONSTRAINT "CommercialOrderReminderSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderReminderSettings" ADD CONSTRAINT "CommercialOrderReminderSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderReminderDelivery" ADD CONSTRAINT "CommercialOrderReminderDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderReminderDelivery" ADD CONSTRAINT "CommercialOrderReminderDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderReminderDelivery" ADD CONSTRAINT "CommercialOrderReminderDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionStoreSettings" ADD CONSTRAINT "PrescriptionStoreSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionStoreSettings" ADD CONSTRAINT "PrescriptionStoreSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionStoreRole" ADD CONSTRAINT "PrescriptionStoreRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionStoreRole" ADD CONSTRAINT "PrescriptionStoreRole_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionStoreAuditEvent" ADD CONSTRAINT "PrescriptionStoreAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionStoreAuditEvent" ADD CONSTRAINT "PrescriptionStoreAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionStoreAuditEvent" ADD CONSTRAINT "PrescriptionStoreAuditEvent_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "PrescriptionStoreSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionChannel" ADD CONSTRAINT "PrescriptionChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionChannel" ADD CONSTRAINT "PrescriptionChannel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionRequest" ADD CONSTRAINT "PrescriptionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionRequest" ADD CONSTRAINT "PrescriptionRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionRequest" ADD CONSTRAINT "PrescriptionRequest_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PrescriptionChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionMedia" ADD CONSTRAINT "PrescriptionMedia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionMedia" ADD CONSTRAINT "PrescriptionMedia_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionMedia" ADD CONSTRAINT "PrescriptionMedia_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrescriptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionMediaAccessEvent" ADD CONSTRAINT "PrescriptionMediaAccessEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionMediaAccessEvent" ADD CONSTRAINT "PrescriptionMediaAccessEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionMediaAccessEvent" ADD CONSTRAINT "PrescriptionMediaAccessEvent_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "PrescriptionMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionTranscription" ADD CONSTRAINT "PrescriptionTranscription_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrescriptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionTranscriptionLine" ADD CONSTRAINT "PrescriptionTranscriptionLine_transcriptionId_fkey" FOREIGN KEY ("transcriptionId") REFERENCES "PrescriptionTranscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionLineMapping" ADD CONSTRAINT "PrescriptionLineMapping_transcriptionLineId_fkey" FOREIGN KEY ("transcriptionLineId") REFERENCES "PrescriptionTranscriptionLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionLineMapping" ADD CONSTRAINT "PrescriptionLineMapping_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPharmacistReview" ADD CONSTRAINT "PrescriptionPharmacistReview_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrescriptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionRequestAuditEvent" ADD CONSTRAINT "PrescriptionRequestAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionRequestAuditEvent" ADD CONSTRAINT "PrescriptionRequestAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionRequestAuditEvent" ADD CONSTRAINT "PrescriptionRequestAuditEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrescriptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPaymentIntent" ADD CONSTRAINT "PrescriptionPaymentIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPaymentIntent" ADD CONSTRAINT "PrescriptionPaymentIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPaymentIntent" ADD CONSTRAINT "PrescriptionPaymentIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPaymentProviderEvent" ADD CONSTRAINT "PrescriptionPaymentProviderEvent_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PrescriptionPaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPaymentRefund" ADD CONSTRAINT "PrescriptionPaymentRefund_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPaymentRefund" ADD CONSTRAINT "PrescriptionPaymentRefund_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPaymentRefund" ADD CONSTRAINT "PrescriptionPaymentRefund_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PrescriptionPaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPickupFulfillment" ADD CONSTRAINT "PrescriptionPickupFulfillment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPickupFulfillment" ADD CONSTRAINT "PrescriptionPickupFulfillment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPickupFulfillment" ADD CONSTRAINT "PrescriptionPickupFulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPickupEvent" ADD CONSTRAINT "PrescriptionPickupEvent_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "PrescriptionPickupFulfillment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryZone" ADD CONSTRAINT "PrescriptionDeliveryZone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryZone" ADD CONSTRAINT "PrescriptionDeliveryZone_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryAddress" ADD CONSTRAINT "PrescriptionDeliveryAddress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryAddress" ADD CONSTRAINT "PrescriptionDeliveryAddress_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryAddress" ADD CONSTRAINT "PrescriptionDeliveryAddress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryAddress" ADD CONSTRAINT "PrescriptionDeliveryAddress_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryAddress" ADD CONSTRAINT "PrescriptionDeliveryAddress_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "PrescriptionDeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryAssignment" ADD CONSTRAINT "PrescriptionDeliveryAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryAssignment" ADD CONSTRAINT "PrescriptionDeliveryAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryAssignment" ADD CONSTRAINT "PrescriptionDeliveryAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryAssignment" ADD CONSTRAINT "PrescriptionDeliveryAssignment_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "PrescriptionDeliveryAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDeliveryEvent" ADD CONSTRAINT "PrescriptionDeliveryEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PrescriptionDeliveryAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppStoreBinding" ADD CONSTRAINT "WhatsAppStoreBinding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppStoreBinding" ADD CONSTRAINT "WhatsAppStoreBinding_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppStoreBinding" ADD CONSTRAINT "WhatsAppStoreBinding_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppInboundEvent" ADD CONSTRAINT "WhatsAppInboundEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppInboundEvent" ADD CONSTRAINT "WhatsAppInboundEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppInboundEvent" ADD CONSTRAINT "WhatsAppInboundEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppEmbeddedSignupSession" ADD CONSTRAINT "WhatsAppEmbeddedSignupSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppEmbeddedSignupSession" ADD CONSTRAINT "WhatsAppEmbeddedSignupSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionCommunicationIntent" ADD CONSTRAINT "PrescriptionCommunicationIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionCommunicationIntent" ADD CONSTRAINT "PrescriptionCommunicationIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionCommunicationAttempt" ADD CONSTRAINT "PrescriptionCommunicationAttempt_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PrescriptionCommunicationIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionCommunicationAttempt" ADD CONSTRAINT "PrescriptionCommunicationAttempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionQuickAction" ADD CONSTRAINT "PrescriptionQuickAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionQuickAction" ADD CONSTRAINT "PrescriptionQuickAction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionRetentionPolicy" ADD CONSTRAINT "PrescriptionRetentionPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionRetentionPolicy" ADD CONSTRAINT "PrescriptionRetentionPolicy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPrivacyRequest" ADD CONSTRAINT "PrescriptionPrivacyRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionPrivacyRequest" ADD CONSTRAINT "PrescriptionPrivacyRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionIncidentControl" ADD CONSTRAINT "PrescriptionIncidentControl_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionIncidentControl" ADD CONSTRAINT "PrescriptionIncidentControl_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSensitiveAccessEvent" ADD CONSTRAINT "PrescriptionSensitiveAccessEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSensitiveAccessEvent" ADD CONSTRAINT "PrescriptionSensitiveAccessEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSensitiveAccessEvent" ADD CONSTRAINT "PrescriptionSensitiveAccessEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrescriptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSensitiveAccessEvent" ADD CONSTRAINT "PrescriptionSensitiveAccessEvent_incidentControlId_fkey" FOREIGN KEY ("incidentControlId") REFERENCES "PrescriptionIncidentControl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionUsageEvent" ADD CONSTRAINT "PrescriptionUsageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionUsageEvent" ADD CONSTRAINT "PrescriptionUsageEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreProfile" ADD CONSTRAINT "ServiceCommerceStoreProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreProfile" ADD CONSTRAINT "ServiceCommerceStoreProfile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreAuditEvent" ADD CONSTRAINT "ServiceCommerceStoreAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreAuditEvent" ADD CONSTRAINT "ServiceCommerceStoreAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreAuditEvent" ADD CONSTRAINT "ServiceCommerceStoreAuditEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ServiceCommerceStoreProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommercePolicyDecision" ADD CONSTRAINT "ServiceCommercePolicyDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommercePolicyDecision" ADD CONSTRAINT "ServiceCommercePolicyDecision_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommercePolicyAuditEvent" ADD CONSTRAINT "ServiceCommercePolicyAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommercePolicyAuditEvent" ADD CONSTRAINT "ServiceCommercePolicyAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommercePolicyAuditEvent" ADD CONSTRAINT "ServiceCommercePolicyAuditEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ServiceCommercePolicyDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceInquiry" ADD CONSTRAINT "CommerceInquiry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceInquiry" ADD CONSTRAINT "CommerceInquiry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceInquiryLine" ADD CONSTRAINT "CommerceInquiryLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceInquiryLine" ADD CONSTRAINT "CommerceInquiryLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceInquiryLine" ADD CONSTRAINT "CommerceInquiryLine_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CommerceInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceInquiryAuditEvent" ADD CONSTRAINT "CommerceInquiryAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceInquiryAuditEvent" ADD CONSTRAINT "CommerceInquiryAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceInquiryAuditEvent" ADD CONSTRAINT "CommerceInquiryAuditEvent_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CommerceInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
