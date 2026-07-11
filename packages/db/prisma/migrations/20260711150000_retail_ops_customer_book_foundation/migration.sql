-- CreateEnum
CREATE TYPE "RetailOpsCustomerIdentityType" AS ENUM ('EMAIL', 'PHONE', 'NAME', 'PLATFORM_ACCOUNT');

-- CreateEnum
CREATE TYPE "RetailOpsCustomerEventType" AS ENUM ('CREATED', 'UPDATED', 'SALE_RECORDED', 'ORDER_REQUESTED', 'MERGED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "retailOpsCustomerId" TEXT;

-- CreateTable
CREATE TABLE "RetailOpsCustomer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "identityKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "phone" TEXT,
    "normalizedPhone" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "lastOrderId" TEXT,
    "lastOrderNumber" TEXT,
    "createdByUserId" TEXT,
    "mergedIntoCustomerId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOpsCustomerIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "RetailOpsCustomerIdentityType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsCustomerIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOpsCustomerEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "actorUserId" TEXT,
    "type" "RetailOpsCustomerEventType" NOT NULL,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailOpsCustomerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_retailOpsCustomerId_createdAt_idx" ON "Order"("retailOpsCustomerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsCustomer_tenantId_storeId_identityKey_key" ON "RetailOpsCustomer"("tenantId", "storeId", "identityKey");

-- CreateIndex
CREATE INDEX "RetailOpsCustomer_tenantId_storeId_lastSeenAt_idx" ON "RetailOpsCustomer"("tenantId", "storeId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "RetailOpsCustomer_customerAccountId_lastSeenAt_idx" ON "RetailOpsCustomer"("customerAccountId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "RetailOpsCustomer_normalizedEmail_idx" ON "RetailOpsCustomer"("normalizedEmail");

-- CreateIndex
CREATE INDEX "RetailOpsCustomer_normalizedPhone_idx" ON "RetailOpsCustomer"("normalizedPhone");

-- CreateIndex
CREATE INDEX "RetailOpsCustomer_mergedIntoCustomerId_idx" ON "RetailOpsCustomer"("mergedIntoCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsCustomerIdentity_tenantId_storeId_type_normalizedValue_key" ON "RetailOpsCustomerIdentity"("tenantId", "storeId", "type", "normalizedValue");

-- CreateIndex
CREATE INDEX "RetailOpsCustomerIdentity_customerId_type_idx" ON "RetailOpsCustomerIdentity"("customerId", "type");

-- CreateIndex
CREATE INDEX "RetailOpsCustomerIdentity_tenantId_storeId_isPrimary_idx" ON "RetailOpsCustomerIdentity"("tenantId", "storeId", "isPrimary");

-- CreateIndex
CREATE INDEX "RetailOpsCustomerEvent_tenantId_storeId_happenedAt_idx" ON "RetailOpsCustomerEvent"("tenantId", "storeId", "happenedAt");

-- CreateIndex
CREATE INDEX "RetailOpsCustomerEvent_customerId_happenedAt_idx" ON "RetailOpsCustomerEvent"("customerId", "happenedAt");

-- CreateIndex
CREATE INDEX "RetailOpsCustomerEvent_orderId_idx" ON "RetailOpsCustomerEvent"("orderId");

-- CreateIndex
CREATE INDEX "RetailOpsCustomerEvent_actorUserId_happenedAt_idx" ON "RetailOpsCustomerEvent"("actorUserId", "happenedAt");

-- CreateIndex
CREATE INDEX "RetailOpsCustomerEvent_type_happenedAt_idx" ON "RetailOpsCustomerEvent"("type", "happenedAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_retailOpsCustomerId_fkey" FOREIGN KEY ("retailOpsCustomerId") REFERENCES "RetailOpsCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomer" ADD CONSTRAINT "RetailOpsCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomer" ADD CONSTRAINT "RetailOpsCustomer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomer" ADD CONSTRAINT "RetailOpsCustomer_mergedIntoCustomerId_fkey" FOREIGN KEY ("mergedIntoCustomerId") REFERENCES "RetailOpsCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomerIdentity" ADD CONSTRAINT "RetailOpsCustomerIdentity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomerIdentity" ADD CONSTRAINT "RetailOpsCustomerIdentity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomerIdentity" ADD CONSTRAINT "RetailOpsCustomerIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "RetailOpsCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomerEvent" ADD CONSTRAINT "RetailOpsCustomerEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomerEvent" ADD CONSTRAINT "RetailOpsCustomerEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomerEvent" ADD CONSTRAINT "RetailOpsCustomerEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "RetailOpsCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCustomerEvent" ADD CONSTRAINT "RetailOpsCustomerEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
