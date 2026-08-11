-- CreateEnum
CREATE TYPE "ServiceBookingResourceKind" AS ENUM ('STAFF', 'ROOM', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceBookingRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ServiceBookingAvailabilityExceptionKind" AS ENUM ('CLOSED', 'OPEN', 'CAPACITY_OVERRIDE');

-- CreateEnum
CREATE TYPE "ServiceBookingHoldStatus" AS ENUM ('HELD', 'CONFIRMED', 'EXPIRED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ServiceBookingStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ServiceBookingPaymentRequirement" AS ENUM ('NONE', 'DEPOSIT', 'FULL');

-- CreateEnum
CREATE TYPE "ServiceBookingPaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ServiceBookingEventType" AS ENUM ('HELD', 'HOLD_EXPIRED', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'ARRIVED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'PAYMENT_STATUS_CHANGED', 'NOTIFICATION_QUEUED');

-- CreateEnum
CREATE TYPE "ServiceBookingNotificationType" AS ENUM ('CONFIRMATION', 'REMINDER', 'RESCHEDULE', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "ServiceBookingNotificationStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceBookingConfigurationEventType" AS ENUM ('CONFIGURATION_CREATED', 'CONFIGURATION_UPDATED');

-- CreateEnum
CREATE TYPE "ServiceBookingAccessPurpose" AS ENUM ('VIEW_SLOTS', 'CONFIRM', 'VIEW_AND_MANAGE');

-- CreateEnum
CREATE TYPE "ServiceBookingAccessStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ServiceBookingRefundOutcome" AS ENUM ('NONE', 'REFUND_ELIGIBLE', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "ServiceBookingRefundPolicy" AS ENUM ('NONE', 'FULL_BEFORE_CUTOFF', 'MANUAL_REVIEW');

-- CreateTable
CREATE TABLE "ServiceBookingStoreSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "defaultSlotInterval" INTEGER NOT NULL DEFAULT 15,
    "defaultHoldMinutes" INTEGER NOT NULL DEFAULT 10,
    "reminderLeadMinutes" INTEGER NOT NULL DEFAULT 1440,
    "updatedByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBookingStoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingOfferingConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "status" "ServiceBookingRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "durationMinutes" INTEGER NOT NULL,
    "holdDurationMinutes" INTEGER NOT NULL DEFAULT 10,
    "leadTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bookingHorizonMinutes" INTEGER NOT NULL DEFAULT 129600,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "paymentRequirement" "ServiceBookingPaymentRequirement" NOT NULL DEFAULT 'NONE',
    "depositAmountMinor" INTEGER,
    "cancellationWindowMinutes" INTEGER NOT NULL DEFAULT 0,
    "refundPolicy" "ServiceBookingRefundPolicy" NOT NULL DEFAULT 'NONE',
    "paymentPolicyRevision" INTEGER NOT NULL DEFAULT 0,
    "cancellationPolicyRevision" INTEGER NOT NULL DEFAULT 0,
    "updatedByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBookingOfferingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "membershipId" TEXT,
    "clientResourceId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ServiceBookingResourceKind" NOT NULL,
    "status" "ServiceBookingRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBookingResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingOfferingResource" (
    "id" TEXT NOT NULL,
    "offeringConfigId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "capacityRequired" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceBookingOfferingResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingAvailabilityRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "clientRuleId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "capacity" INTEGER,
    "effectiveFromDate" DATE,
    "effectiveToDate" DATE,
    "status" "ServiceBookingRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "updatedByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBookingAvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingAvailabilityException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "clientExceptionId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "kind" "ServiceBookingAvailabilityExceptionKind" NOT NULL,
    "capacity" INTEGER,
    "reasonCode" TEXT,
    "status" "ServiceBookingRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "updatedByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBookingAvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingConfigurationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offeringConfigId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "type" "ServiceBookingConfigurationEventType" NOT NULL,
    "previousRevision" INTEGER,
    "nextRevision" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceBookingConfigurationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offeringConfigId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "sourceType" "CommerceQuoteSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "clientHoldId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "accessCapabilityId" TEXT NOT NULL,
    "bookingPolicyRevision" INTEGER NOT NULL,
    "status" "ServiceBookingHoldStatus" NOT NULL DEFAULT 'HELD',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBookingHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBooking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offeringConfigId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "holdId" TEXT,
    "sourceType" "CommerceQuoteSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "quoteVersionId" TEXT,
    "commercialOrderId" TEXT,
    "serviceJobId" TEXT,
    "clientBookingId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "ServiceBookingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "paymentStatus" "ServiceBookingPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "timezoneSnapshot" TEXT NOT NULL,
    "paymentRequirementSnapshot" "ServiceBookingPaymentRequirement" NOT NULL,
    "depositAmountMinorSnapshot" INTEGER,
    "cancellationWindowSnapshot" INTEGER NOT NULL,
    "refundPolicySnapshot" "ServiceBookingRefundPolicy" NOT NULL,
    "offeringPolicyRevisionSnapshot" INTEGER NOT NULL,
    "paymentPolicyRevisionSnapshot" INTEGER NOT NULL,
    "cancellationPolicyRevisionSnapshot" INTEGER NOT NULL,
    "payableAmountMinorSnapshot" INTEGER NOT NULL,
    "requiredPaymentMinorSnapshot" INTEGER NOT NULL,
    "currencyCodeSnapshot" TEXT NOT NULL,
    "customerName" TEXT,
    "customerContactCiphertext" TEXT,
    "notificationChannelSnapshot" "ServiceNotificationChannel",
    "notificationPolicyChannelSnapshot" "ServiceCommercePolicyChannel",
    "reminderLeadMinutesSnapshot" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "serviceStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingAccessCapability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offeringConfigId" TEXT NOT NULL,
    "sourceType" "CommerceQuoteSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "bookingId" TEXT,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "purpose" "ServiceBookingAccessPurpose" NOT NULL,
    "status" "ServiceBookingAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "stateRevision" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedFromId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBookingAccessCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "clientOperationId" TEXT,
    "payloadHash" TEXT,
    "type" "ServiceBookingEventType" NOT NULL,
    "fromStatus" "ServiceBookingStatus",
    "toStatus" "ServiceBookingStatus",
    "actorUserId" TEXT,
    "reasonCode" TEXT,
    "previousStartAt" TIMESTAMP(3),
    "previousEndAt" TIMESTAMP(3),
    "nextStartAt" TIMESTAMP(3),
    "nextEndAt" TIMESTAMP(3),
    "previousResourceId" TEXT,
    "nextResourceId" TEXT,
    "capacitySnapshot" INTEGER,
    "offeringPolicyRevisionSnapshot" INTEGER,
    "paymentPolicyRevisionSnapshot" INTEGER,
    "cancellationPolicyRevisionSnapshot" INTEGER,
    "refundOutcome" "ServiceBookingRefundOutcome",
    "refundAmountMinor" INTEGER,
    "commercialPaymentId" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceBookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingNotificationIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "type" "ServiceBookingNotificationType" NOT NULL,
    "channel" "ServiceNotificationChannel" NOT NULL,
    "policyChannel" "ServiceCommercePolicyChannel" NOT NULL,
    "recipientCiphertext" TEXT NOT NULL,
    "authorizationUserId" TEXT NOT NULL,
    "status" "ServiceBookingNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBookingNotificationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingStoreSettings_storeId_key" ON "ServiceBookingStoreSettings"("storeId");

-- CreateIndex
CREATE INDEX "ServiceBookingStoreSettings_tenantId_updatedAt_idx" ON "ServiceBookingStoreSettings"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "ServiceBookingOfferingConfig_tenantId_storeId_status_idx" ON "ServiceBookingOfferingConfig"("tenantId", "storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingOfferingConfig_storeId_offeringId_key" ON "ServiceBookingOfferingConfig"("storeId", "offeringId");

-- CreateIndex
CREATE INDEX "ServiceBookingResource_tenantId_storeId_status_idx" ON "ServiceBookingResource"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "ServiceBookingResource_membershipId_status_idx" ON "ServiceBookingResource"("membershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingResource_storeId_name_key" ON "ServiceBookingResource"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingResource_tenantId_clientResourceId_key" ON "ServiceBookingResource"("tenantId", "clientResourceId");

-- CreateIndex
CREATE INDEX "ServiceBookingOfferingResource_resourceId_idx" ON "ServiceBookingOfferingResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingOfferingResource_offeringConfigId_resourceId_key" ON "ServiceBookingOfferingResource"("offeringConfigId", "resourceId");

-- CreateIndex
CREATE INDEX "ServiceBookingAvailabilityRule_tenantId_storeId_resourceId__idx" ON "ServiceBookingAvailabilityRule"("tenantId", "storeId", "resourceId", "dayOfWeek", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingAvailabilityRule_resourceId_clientRuleId_dayO_key" ON "ServiceBookingAvailabilityRule"("resourceId", "clientRuleId", "dayOfWeek", "revision");

-- CreateIndex
CREATE INDEX "ServiceBookingAvailabilityException_tenantId_storeId_resour_idx" ON "ServiceBookingAvailabilityException"("tenantId", "storeId", "resourceId", "startAt", "endAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingAvailabilityException_resourceId_clientExcept_key" ON "ServiceBookingAvailabilityException"("resourceId", "clientExceptionId", "revision");

-- CreateIndex
CREATE INDEX "ServiceBookingConfigurationEvent_tenantId_storeId_offeringC_idx" ON "ServiceBookingConfigurationEvent"("tenantId", "storeId", "offeringConfigId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingConfigurationEvent_tenantId_clientOperationId_key" ON "ServiceBookingConfigurationEvent"("tenantId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingHold_accessCapabilityId_key" ON "ServiceBookingHold"("accessCapabilityId");

-- CreateIndex
CREATE INDEX "ServiceBookingHold_tenantId_storeId_resourceId_startAt_endA_idx" ON "ServiceBookingHold"("tenantId", "storeId", "resourceId", "startAt", "endAt", "status");

-- CreateIndex
CREATE INDEX "ServiceBookingHold_expiresAt_status_idx" ON "ServiceBookingHold"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingHold_tenantId_clientHoldId_key" ON "ServiceBookingHold"("tenantId", "clientHoldId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBooking_holdId_key" ON "ServiceBooking"("holdId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBooking_serviceJobId_key" ON "ServiceBooking"("serviceJobId");

-- CreateIndex
CREATE INDEX "ServiceBooking_tenantId_storeId_status_startAt_idx" ON "ServiceBooking"("tenantId", "storeId", "status", "startAt");

-- CreateIndex
CREATE INDEX "ServiceBooking_resourceId_startAt_endAt_status_idx" ON "ServiceBooking"("resourceId", "startAt", "endAt", "status");

-- CreateIndex
CREATE INDEX "ServiceBooking_sourceType_sourceId_idx" ON "ServiceBooking"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ServiceBooking_quoteVersionId_idx" ON "ServiceBooking"("quoteVersionId");

-- CreateIndex
CREATE INDEX "ServiceBooking_commercialOrderId_idx" ON "ServiceBooking"("commercialOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBooking_tenantId_clientBookingId_key" ON "ServiceBooking"("tenantId", "clientBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingAccessCapability_tokenDigest_key" ON "ServiceBookingAccessCapability"("tokenDigest");

-- CreateIndex
CREATE INDEX "ServiceBookingAccessCapability_bookingId_status_expiresAt_idx" ON "ServiceBookingAccessCapability"("bookingId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ServiceBookingAccessCapability_sourceType_sourceId_purpose__idx" ON "ServiceBookingAccessCapability"("sourceType", "sourceId", "purpose", "status");

-- CreateIndex
CREATE INDEX "ServiceBookingAccessCapability_tenantId_storeId_status_expi_idx" ON "ServiceBookingAccessCapability"("tenantId", "storeId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingAccessCapability_tenantId_clientOperationId_key" ON "ServiceBookingAccessCapability"("tenantId", "clientOperationId");

-- CreateIndex
CREATE INDEX "ServiceBookingEvent_bookingId_effectiveAt_idx" ON "ServiceBookingEvent"("bookingId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceBookingEvent_tenantId_storeId_type_effectiveAt_idx" ON "ServiceBookingEvent"("tenantId", "storeId", "type", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceBookingEvent_commercialPaymentId_idx" ON "ServiceBookingEvent"("commercialPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingEvent_tenantId_clientOperationId_key" ON "ServiceBookingEvent"("tenantId", "clientOperationId");

-- CreateIndex
CREATE INDEX "ServiceBookingNotificationIntent_tenantId_storeId_status_sc_idx" ON "ServiceBookingNotificationIntent"("tenantId", "storeId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ServiceBookingNotificationIntent_bookingId_type_idx" ON "ServiceBookingNotificationIntent"("bookingId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBookingNotificationIntent_tenantId_deduplicationKey_key" ON "ServiceBookingNotificationIntent"("tenantId", "deduplicationKey");

-- AddForeignKey
ALTER TABLE "ServiceBookingStoreSettings" ADD CONSTRAINT "ServiceBookingStoreSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingStoreSettings" ADD CONSTRAINT "ServiceBookingStoreSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingOfferingConfig" ADD CONSTRAINT "ServiceBookingOfferingConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingOfferingConfig" ADD CONSTRAINT "ServiceBookingOfferingConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingOfferingConfig" ADD CONSTRAINT "ServiceBookingOfferingConfig_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingResource" ADD CONSTRAINT "ServiceBookingResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingResource" ADD CONSTRAINT "ServiceBookingResource_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingResource" ADD CONSTRAINT "ServiceBookingResource_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingOfferingResource" ADD CONSTRAINT "ServiceBookingOfferingResource_offeringConfigId_fkey" FOREIGN KEY ("offeringConfigId") REFERENCES "ServiceBookingOfferingConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingOfferingResource" ADD CONSTRAINT "ServiceBookingOfferingResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ServiceBookingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAvailabilityRule" ADD CONSTRAINT "ServiceBookingAvailabilityRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAvailabilityRule" ADD CONSTRAINT "ServiceBookingAvailabilityRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAvailabilityRule" ADD CONSTRAINT "ServiceBookingAvailabilityRule_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ServiceBookingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAvailabilityException" ADD CONSTRAINT "ServiceBookingAvailabilityException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAvailabilityException" ADD CONSTRAINT "ServiceBookingAvailabilityException_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAvailabilityException" ADD CONSTRAINT "ServiceBookingAvailabilityException_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ServiceBookingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingConfigurationEvent" ADD CONSTRAINT "ServiceBookingConfigurationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingConfigurationEvent" ADD CONSTRAINT "ServiceBookingConfigurationEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingConfigurationEvent" ADD CONSTRAINT "ServiceBookingConfigurationEvent_offeringConfigId_fkey" FOREIGN KEY ("offeringConfigId") REFERENCES "ServiceBookingOfferingConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingHold" ADD CONSTRAINT "ServiceBookingHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingHold" ADD CONSTRAINT "ServiceBookingHold_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingHold" ADD CONSTRAINT "ServiceBookingHold_offeringConfigId_fkey" FOREIGN KEY ("offeringConfigId") REFERENCES "ServiceBookingOfferingConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingHold" ADD CONSTRAINT "ServiceBookingHold_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ServiceBookingResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingHold" ADD CONSTRAINT "ServiceBookingHold_accessCapabilityId_fkey" FOREIGN KEY ("accessCapabilityId") REFERENCES "ServiceBookingAccessCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_offeringConfigId_fkey" FOREIGN KEY ("offeringConfigId") REFERENCES "ServiceBookingOfferingConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ServiceBookingResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "ServiceBookingHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_commercialOrderId_fkey" FOREIGN KEY ("commercialOrderId") REFERENCES "CommercialOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAccessCapability" ADD CONSTRAINT "ServiceBookingAccessCapability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAccessCapability" ADD CONSTRAINT "ServiceBookingAccessCapability_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAccessCapability" ADD CONSTRAINT "ServiceBookingAccessCapability_offeringConfigId_fkey" FOREIGN KEY ("offeringConfigId") REFERENCES "ServiceBookingOfferingConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAccessCapability" ADD CONSTRAINT "ServiceBookingAccessCapability_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingAccessCapability" ADD CONSTRAINT "ServiceBookingAccessCapability_rotatedFromId_fkey" FOREIGN KEY ("rotatedFromId") REFERENCES "ServiceBookingAccessCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingEvent" ADD CONSTRAINT "ServiceBookingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingEvent" ADD CONSTRAINT "ServiceBookingEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingEvent" ADD CONSTRAINT "ServiceBookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingEvent" ADD CONSTRAINT "ServiceBookingEvent_commercialPaymentId_fkey" FOREIGN KEY ("commercialPaymentId") REFERENCES "CommercialOrderPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingNotificationIntent" ADD CONSTRAINT "ServiceBookingNotificationIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingNotificationIntent" ADD CONSTRAINT "ServiceBookingNotificationIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingNotificationIntent" ADD CONSTRAINT "ServiceBookingNotificationIntent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
