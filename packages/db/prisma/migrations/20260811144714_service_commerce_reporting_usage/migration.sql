-- CreateEnum
CREATE TYPE "ServiceCommerceUsageSourceKind" AS ENUM ('SERVICE', 'PRESCRIPTION', 'COMMERCE_INQUIRY', 'BOOKING', 'CATALOG', 'MEDIA', 'CUSTOMER_CHANNEL', 'FULFILLMENT');

-- CreateEnum
CREATE TYPE "ServiceCommerceUsageEventType" AS ENUM ('MESSAGE_SENT', 'MESSAGE_DELIVERED', 'MESSAGE_READ', 'MESSAGE_FAILED', 'PAYMENT_RECONCILED', 'DELIVERY_RECONCILED', 'NUMBER_FEE_RECONCILED', 'SUBSCRIPTION_CHARGE_RECONCILED', 'PLATFORM_CHARGE_RECONCILED', 'TAX_RECONCILED');

-- CreateEnum
CREATE TYPE "ServiceCommerceUsageReconciliationStatus" AS ENUM ('PENDING', 'RECONCILED', 'FAILED');

-- CreateTable
CREATE TABLE "ServiceCommerceUsageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "connectionId" TEXT,
    "sourceKind" "ServiceCommerceUsageSourceKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "eventType" "ServiceCommerceUsageEventType" NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "providerKey" TEXT,
    "billingOwnerSnapshot" TEXT,
    "messageCategory" TEXT,
    "recipientMarket" TEXT,
    "currencyCode" TEXT NOT NULL,
    "metaCostMinor" INTEGER,
    "bspCostMinor" INTEGER,
    "numberCostMinor" INTEGER,
    "paymentProviderFeeMinor" INTEGER,
    "deliveryCostMinor" INTEGER,
    "taxMinor" INTEGER,
    "platformChargeMinor" INTEGER,
    "subscriptionChargeMinor" INTEGER,
    "revenueMinor" INTEGER,
    "reconciliationStatus" "ServiceCommerceUsageReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "reconciliationSource" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCommerceUsageEvent_tenantId_storeId_occurredAt_idx" ON "ServiceCommerceUsageEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceUsageEvent_tenantId_connectionId_occurredAt_idx" ON "ServiceCommerceUsageEvent"("tenantId", "connectionId", "occurredAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceUsageEvent_tenantId_eventType_occurredAt_idx" ON "ServiceCommerceUsageEvent"("tenantId", "eventType", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceUsageEvent_tenantId_deduplicationKey_key" ON "ServiceCommerceUsageEvent"("tenantId", "deduplicationKey");

-- AddForeignKey
ALTER TABLE "ServiceCommerceUsageEvent" ADD CONSTRAINT "ServiceCommerceUsageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceUsageEvent" ADD CONSTRAINT "ServiceCommerceUsageEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceUsageEvent" ADD CONSTRAINT "ServiceCommerceUsageEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
