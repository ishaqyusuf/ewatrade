/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,id]` on the table `CommercialOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,id]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CustomerLedgerEntryKind" AS ENUM ('OPENING_DEBT', 'OPENING_CREDIT', 'ORDER_CHARGE', 'ORDER_PAYMENT', 'RECEIPT', 'CREDIT_NOTE', 'REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "CustomerLedgerSide" AS ENUM ('DEBIT', 'CREDIT');

-- AlterTable
ALTER TABLE "CommercialOrder" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "CustomerLedgerAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "lastSequence" BIGINT NOT NULL DEFAULT 0,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "kind" "CustomerLedgerEntryKind" NOT NULL,
    "side" "CustomerLedgerSide" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "orderId" TEXT,
    "storeId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "reversalOfId" TEXT,

    CONSTRAINT "CustomerLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLedgerAllocation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "creditEntryId" TEXT NOT NULL,
    "chargeEntryId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLedgerAllocationRelease" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerAllocationRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLedgerCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerAccount_tenantId_customerId_currencyCode_key" ON "CustomerLedgerAccount"("tenantId", "customerId", "currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerAccount_tenantId_id_key" ON "CustomerLedgerAccount"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerEntry_reversalOfId_key" ON "CustomerLedgerEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "CustomerLedgerEntry_accountId_effectiveAt_sequence_idx" ON "CustomerLedgerEntry"("accountId", "effectiveAt", "sequence");

-- CreateIndex
CREATE INDEX "CustomerLedgerEntry_tenantId_storeId_effectiveAt_idx" ON "CustomerLedgerEntry"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "CustomerLedgerEntry_orderId_idx" ON "CustomerLedgerEntry"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerEntry_accountId_id_key" ON "CustomerLedgerEntry"("accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerEntry_accountId_sequence_key" ON "CustomerLedgerEntry"("accountId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerEntry_tenantId_sourceKind_sourceId_key" ON "CustomerLedgerEntry"("tenantId", "sourceKind", "sourceId");

-- CreateIndex
CREATE INDEX "CustomerLedgerAllocation_accountId_creditEntryId_idx" ON "CustomerLedgerAllocation"("accountId", "creditEntryId");

-- CreateIndex
CREATE INDEX "CustomerLedgerAllocation_accountId_chargeEntryId_idx" ON "CustomerLedgerAllocation"("accountId", "chargeEntryId");

-- CreateIndex
CREATE INDEX "CustomerLedgerAllocationRelease_allocationId_createdAt_idx" ON "CustomerLedgerAllocationRelease"("allocationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerLedgerCommand_accountId_createdAt_idx" ON "CustomerLedgerCommand"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerCommand_tenantId_clientCommandId_key" ON "CustomerLedgerCommand"("tenantId", "clientCommandId");

-- CreateIndex
CREATE INDEX "CommercialOrder_tenantId_customerId_createdAt_idx" ON "CommercialOrder"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrder_tenantId_id_key" ON "CommercialOrder"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_id_key" ON "Customer"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "CommercialOrder" ADD CONSTRAINT "CommercialOrder_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerAccount" ADD CONSTRAINT "CustomerLedgerAccount_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "CustomerLedgerAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "CommercialOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_accountId_reversalOfId_fkey" FOREIGN KEY ("accountId", "reversalOfId") REFERENCES "CustomerLedgerEntry"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerAllocation" ADD CONSTRAINT "CustomerLedgerAllocation_accountId_creditEntryId_fkey" FOREIGN KEY ("accountId", "creditEntryId") REFERENCES "CustomerLedgerEntry"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerAllocation" ADD CONSTRAINT "CustomerLedgerAllocation_accountId_chargeEntryId_fkey" FOREIGN KEY ("accountId", "chargeEntryId") REFERENCES "CustomerLedgerEntry"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerAllocationRelease" ADD CONSTRAINT "CustomerLedgerAllocationRelease_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "CustomerLedgerAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerCommand" ADD CONSTRAINT "CustomerLedgerCommand_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "CustomerLedgerAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
