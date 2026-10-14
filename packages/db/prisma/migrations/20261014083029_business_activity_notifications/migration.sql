-- CreateEnum
CREATE TYPE "BusinessActivityOutboxStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BusinessNotificationReceiptState" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateTable
CREATE TABLE "BusinessActivityEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "financeBookId" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "businessEventKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceAction" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "subjectUserId" TEXT,
    "subjectMembershipId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordingOrigin" TEXT NOT NULL DEFAULT 'snapshot',
    "payload" JSONB NOT NULL,
    "amountMinor" BIGINT,
    "currencyCode" TEXT,
    "correlationKey" TEXT,
    "correctionOfEventKey" TEXT,

    CONSTRAINT "BusinessActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessActivityStoreScope" (
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "BusinessActivityStoreScope_pkey" PRIMARY KEY ("tenantId","eventId","storeId")
);

-- CreateTable
CREATE TABLE "BusinessActivityOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "consumer" TEXT NOT NULL DEFAULT 'in_app',
    "status" "BusinessActivityOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimId" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessActivityOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessNotificationPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inAppAllowed" BOOLEAN NOT NULL DEFAULT false,
    "emailAllowed" BOOLEAN NOT NULL DEFAULT false,
    "inAppDefault" BOOLEAN NOT NULL DEFAULT false,
    "emailDefault" BOOLEAN NOT NULL DEFAULT false,
    "recipientRoles" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessNotificationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessNotificationSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scopeKind" TEXT NOT NULL,
    "inAppAllowed" BOOLEAN NOT NULL DEFAULT false,
    "emailAllowed" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessNotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessNotificationSubscriptionStore" (
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "BusinessNotificationSubscriptionStore_pkey" PRIMARY KEY ("tenantId","subscriptionId","storeId")
);

-- CreateTable
CREATE TABLE "BusinessNotificationPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inApp" TEXT NOT NULL DEFAULT 'inherit',
    "email" TEXT NOT NULL DEFAULT 'inherit',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessNotificationReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "state" "BusinessNotificationReceiptState" NOT NULL DEFAULT 'UNREAD',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "BusinessNotificationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_occurredAt_id_idx" ON "BusinessActivityEvent"("tenantId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_recordedAt_id_idx" ON "BusinessActivityEvent"("tenantId", "recordedAt", "id");

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_type_occurredAt_id_idx" ON "BusinessActivityEvent"("tenantId", "type", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_category_occurredAt_id_idx" ON "BusinessActivityEvent"("tenantId", "category", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_actorMembershipId_occurredAt_idx" ON "BusinessActivityEvent"("tenantId", "actorMembershipId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_actorUserId_idx" ON "BusinessActivityEvent"("tenantId", "actorUserId");

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_subjectMembershipId_occurred_idx" ON "BusinessActivityEvent"("tenantId", "subjectMembershipId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_subjectUserId_idx" ON "BusinessActivityEvent"("tenantId", "subjectUserId");

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_storeId_occurredAt_id_idx" ON "BusinessActivityEvent"("tenantId", "storeId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "BusinessActivityEvent_tenantId_sourceKind_sourceId_idx" ON "BusinessActivityEvent"("tenantId", "sourceKind", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessActivityEvent_tenantId_id_key" ON "BusinessActivityEvent"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessActivityEvent_tenantId_businessEventKey_key" ON "BusinessActivityEvent"("tenantId", "businessEventKey");

-- CreateIndex
CREATE INDEX "BusinessActivityStoreScope_tenantId_storeId_eventId_idx" ON "BusinessActivityStoreScope"("tenantId", "storeId", "eventId");

-- CreateIndex
CREATE INDEX "BusinessActivityOutbox_status_nextAttemptAt_idx" ON "BusinessActivityOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "BusinessActivityOutbox_status_claimExpiresAt_idx" ON "BusinessActivityOutbox"("status", "claimExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessActivityOutbox_tenantId_eventId_consumer_key" ON "BusinessActivityOutbox"("tenantId", "eventId", "consumer");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessNotificationPolicy_tenantId_type_key" ON "BusinessNotificationPolicy"("tenantId", "type");

-- CreateIndex
CREATE INDEX "BusinessNotificationSubscription_tenantId_type_enabled_idx" ON "BusinessNotificationSubscription"("tenantId", "type", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessNotificationSubscription_tenantId_id_key" ON "BusinessNotificationSubscription"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessNotificationSubscription_tenantId_membershipId_type_key" ON "BusinessNotificationSubscription"("tenantId", "membershipId", "type");

-- CreateIndex
CREATE INDEX "BusinessNotificationSubscriptionStore_tenantId_storeId_idx" ON "BusinessNotificationSubscriptionStore"("tenantId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessNotificationPreference_tenantId_membershipId_type_key" ON "BusinessNotificationPreference"("tenantId", "membershipId", "type");

-- CreateIndex
CREATE INDEX "BusinessNotificationReceipt_tenantId_membershipId_state_occ_idx" ON "BusinessNotificationReceipt"("tenantId", "membershipId", "state", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "BusinessNotificationReceipt_tenantId_membershipId_createdAt_idx" ON "BusinessNotificationReceipt"("tenantId", "membershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessNotificationReceipt_tenantId_eventId_membershipId_key" ON "BusinessNotificationReceipt"("tenantId", "eventId", "membershipId");

-- AddForeignKey
ALTER TABLE "BusinessActivityEvent" ADD CONSTRAINT "BusinessActivityEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessActivityEvent" ADD CONSTRAINT "BusinessActivityEvent_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "Store"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessActivityEvent" ADD CONSTRAINT "BusinessActivityEvent_tenantId_financeBookId_fkey" FOREIGN KEY ("tenantId", "financeBookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessActivityStoreScope" ADD CONSTRAINT "BusinessActivityStoreScope_tenantId_eventId_fkey" FOREIGN KEY ("tenantId", "eventId") REFERENCES "BusinessActivityEvent"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessActivityStoreScope" ADD CONSTRAINT "BusinessActivityStoreScope_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "Store"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessActivityOutbox" ADD CONSTRAINT "BusinessActivityOutbox_tenantId_eventId_fkey" FOREIGN KEY ("tenantId", "eventId") REFERENCES "BusinessActivityEvent"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotificationPolicy" ADD CONSTRAINT "BusinessNotificationPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotificationSubscription" ADD CONSTRAINT "BusinessNotificationSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotificationSubscription" ADD CONSTRAINT "BusinessNotificationSubscription_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotificationSubscriptionStore" ADD CONSTRAINT "BusinessNotificationSubscriptionStore_tenantId_subscriptio_fkey" FOREIGN KEY ("tenantId", "subscriptionId") REFERENCES "BusinessNotificationSubscription"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotificationSubscriptionStore" ADD CONSTRAINT "BusinessNotificationSubscriptionStore_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "Store"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotificationPreference" ADD CONSTRAINT "BusinessNotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotificationPreference" ADD CONSTRAINT "BusinessNotificationPreference_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotificationReceipt" ADD CONSTRAINT "BusinessNotificationReceipt_tenantId_eventId_fkey" FOREIGN KEY ("tenantId", "eventId") REFERENCES "BusinessActivityEvent"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessNotificationReceipt" ADD CONSTRAINT "BusinessNotificationReceipt_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
