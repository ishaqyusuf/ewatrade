-- CreateEnum
CREATE TYPE "ServiceCommerceCustomerActionType" AS ENUM ('REQUEST_QUOTE', 'VIEW_QUOTE', 'CHOOSE_QUOTE_OPTION', 'BOOK', 'PAY_NOW', 'PICK_UP', 'DELIVERY', 'TALK_TO_STAFF', 'RESCHEDULE', 'CANCEL');

-- CreateEnum
CREATE TYPE "ServiceCommerceCustomerActionSourceKind" AS ENUM ('SERVICE', 'PRESCRIPTION', 'COMMERCE_INQUIRY');

-- CreateEnum
CREATE TYPE "ServiceCommerceCustomerActionChannel" AS ENUM ('WEB', 'STAFF', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ServiceCommerceCustomerActionTargetType" AS ENUM ('SOURCE', 'QUOTE_VERSION', 'QUOTE_OPTION', 'BOOKING', 'COMMERCIAL_ORDER', 'CUSTOMER_ENTRY_POINT');

-- CreateEnum
CREATE TYPE "ServiceCommerceCustomerActionCapabilityStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ServiceCommerceCustomerActionExecutionOutcome" AS ENUM ('COMPLETED', 'RECOVERY');

-- CreateEnum
CREATE TYPE "ServiceCommerceCustomerNotificationStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceCommerceCustomerNotificationAttemptStatus" AS ENUM ('CLAIMED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ServiceCommerceCustomerNotificationReceiptStatus" AS ENUM ('DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "ServiceCommerceCustomerActionCapability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceKind" "ServiceCommerceCustomerActionSourceKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" TIMESTAMP(3) NOT NULL,
    "action" "ServiceCommerceCustomerActionType" NOT NULL,
    "channel" "ServiceCommerceCustomerActionChannel" NOT NULL,
    "targetType" "ServiceCommerceCustomerActionTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetVersion" TEXT NOT NULL,
    "targetOptionId" TEXT,
    "clientCapabilityId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "status" "ServiceCommerceCustomerActionCapabilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "confirmationRequired" BOOLEAN NOT NULL DEFAULT false,
    "amountMinor" INTEGER,
    "currencyCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "notificationIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCommerceCustomerActionCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceCustomerActionExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "outcome" "ServiceCommerceCustomerActionExecutionOutcome" NOT NULL,
    "resultKind" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceCustomerActionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceCustomerNotificationIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "clientIntentId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "channel" "ServiceCommerceCustomerActionChannel" NOT NULL,
    "protectedRecipient" TEXT NOT NULL,
    "messageKind" TEXT NOT NULL,
    "templateKey" TEXT,
    "templateRequired" BOOLEAN NOT NULL DEFAULT false,
    "serviceWindowExpiresAt" TIMESTAMP(3),
    "status" "ServiceCommerceCustomerNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ServiceCommerceCustomerNotificationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceCustomerNotificationAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "notificationIntentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "ServiceCommerceCustomerNotificationAttemptStatus" NOT NULL,
    "providerKey" TEXT,
    "providerOperationId" TEXT,
    "failureCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceCommerceCustomerNotificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceCustomerNotificationReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "notificationIntentId" TEXT NOT NULL,
    "providerReceiptId" TEXT NOT NULL,
    "status" "ServiceCommerceCustomerNotificationReceiptStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceCustomerNotificationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceCustomerActionCapability_tokenDigest_key" ON "ServiceCommerceCustomerActionCapability"("tokenDigest");

-- CreateIndex
CREATE INDEX "ServiceCommerceCustomerActionCapability_tenantId_storeId_so_idx" ON "ServiceCommerceCustomerActionCapability"("tenantId", "storeId", "sourceKind", "sourceId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceCustomerActionCapability_targetType_targetId_idx" ON "ServiceCommerceCustomerActionCapability"("targetType", "targetId", "targetVersion");

-- CreateIndex
CREATE INDEX "ServiceCommerceCustomerActionCapability_notificationIntentI_idx" ON "ServiceCommerceCustomerActionCapability"("notificationIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceCustomerActionCapability_tenantId_clientCapa_key" ON "ServiceCommerceCustomerActionCapability"("tenantId", "clientCapabilityId");

-- CreateIndex
CREATE INDEX "ServiceCommerceCustomerActionExecution_tenantId_storeId_exe_idx" ON "ServiceCommerceCustomerActionExecution"("tenantId", "storeId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceCustomerActionExecution_capabilityId_clientO_key" ON "ServiceCommerceCustomerActionExecution"("capabilityId", "clientOperationId");

-- CreateIndex
CREATE INDEX "ServiceCommerceCustomerNotificationIntent_tenantId_storeId__idx" ON "ServiceCommerceCustomerNotificationIntent"("tenantId", "storeId", "status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceCustomerNotificationIntent_tenantId_clientIn_key" ON "ServiceCommerceCustomerNotificationIntent"("tenantId", "clientIntentId");

-- CreateIndex
CREATE INDEX "ServiceCommerceCustomerNotificationAttempt_tenantId_storeId_idx" ON "ServiceCommerceCustomerNotificationAttempt"("tenantId", "storeId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceCustomerNotificationAttempt_notificationInte_key" ON "ServiceCommerceCustomerNotificationAttempt"("notificationIntentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "ServiceCommerceCustomerNotificationReceipt_notificationInte_idx" ON "ServiceCommerceCustomerNotificationReceipt"("notificationIntentId", "occurredAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceCustomerNotificationReceipt_tenantId_storeId_idx" ON "ServiceCommerceCustomerNotificationReceipt"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceCustomerNotificationReceipt_tenantId_provide_key" ON "ServiceCommerceCustomerNotificationReceipt"("tenantId", "providerReceiptId");

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerActionCapability" ADD CONSTRAINT "ServiceCommerceCustomerActionCapability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerActionCapability" ADD CONSTRAINT "ServiceCommerceCustomerActionCapability_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerActionCapability" ADD CONSTRAINT "ServiceCommerceCustomerActionCapability_notificationIntent_fkey" FOREIGN KEY ("notificationIntentId") REFERENCES "ServiceCommerceCustomerNotificationIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerActionExecution" ADD CONSTRAINT "ServiceCommerceCustomerActionExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerActionExecution" ADD CONSTRAINT "ServiceCommerceCustomerActionExecution_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerActionExecution" ADD CONSTRAINT "ServiceCommerceCustomerActionExecution_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "ServiceCommerceCustomerActionCapability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerNotificationIntent" ADD CONSTRAINT "ServiceCommerceCustomerNotificationIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerNotificationIntent" ADD CONSTRAINT "ServiceCommerceCustomerNotificationIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerNotificationAttempt" ADD CONSTRAINT "ServiceCommerceCustomerNotificationAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerNotificationAttempt" ADD CONSTRAINT "ServiceCommerceCustomerNotificationAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerNotificationAttempt" ADD CONSTRAINT "ServiceCommerceCustomerNotificationAttempt_notificationInt_fkey" FOREIGN KEY ("notificationIntentId") REFERENCES "ServiceCommerceCustomerNotificationIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerNotificationReceipt" ADD CONSTRAINT "ServiceCommerceCustomerNotificationReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerNotificationReceipt" ADD CONSTRAINT "ServiceCommerceCustomerNotificationReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceCustomerNotificationReceipt" ADD CONSTRAINT "ServiceCommerceCustomerNotificationReceipt_notificationInt_fkey" FOREIGN KEY ("notificationIntentId") REFERENCES "ServiceCommerceCustomerNotificationIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
