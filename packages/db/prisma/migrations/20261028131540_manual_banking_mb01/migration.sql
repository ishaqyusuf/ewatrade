-- CreateEnum
CREATE TYPE "CustomerFundsRefundStatus" AS ENUM ('REQUESTED', 'RESERVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManualReceiptAssessmentState" AS ENUM ('PENDING', 'CHECKING', 'COMPLETE', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "ManualPaymentReport" ADD COLUMN     "attemptId" TEXT,
ADD COLUMN     "receiptGeneration" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "CustomerFundsRefundRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "creditEntryId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "destinationCiphertext" TEXT NOT NULL,
    "destinationFingerprint" TEXT NOT NULL,
    "status" "CustomerFundsRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "completedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "outgoingReference" TEXT,
    "refundEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "CustomerFundsRefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPaymentAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "clientAttemptId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPaymentTransferConsumption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "receivingAccountId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "normalizedReference" TEXT NOT NULL,
    "rawReference" TEXT NOT NULL,
    "identityDigest" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "validatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPaymentTransferConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualReceiptAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "receiptDigest" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "state" "ManualReceiptAssessmentState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "providerStartedAt" TIMESTAMP(3),
    "provider" TEXT,
    "model" TEXT,
    "providerRequestId" TEXT,
    "usageEventId" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "unavailableReason" TEXT,
    "extraction" JSONB,
    "findings" JSONB,
    "amountMinor" INTEGER,
    "currencyCode" TEXT,
    "recipientLast4" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualReceiptAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFundsRefundRequest_refundEntryId_key" ON "CustomerFundsRefundRequest"("refundEntryId");

-- CreateIndex
CREATE INDEX "CustomerFundsRefundRequest_accountId_creditEntryId_status_idx" ON "CustomerFundsRefundRequest"("accountId", "creditEntryId", "status");

-- CreateIndex
CREATE INDEX "CustomerFundsRefundRequest_tenantId_status_createdAt_idx" ON "CustomerFundsRefundRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ManualPaymentAttempt_linkId_createdAt_id_idx" ON "ManualPaymentAttempt"("linkId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentAttempt_tenantId_paymentReference_key" ON "ManualPaymentAttempt"("tenantId", "paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentAttempt_linkId_clientAttemptId_key" ON "ManualPaymentAttempt"("linkId", "clientAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentAttempt_linkId_sequence_key" ON "ManualPaymentAttempt"("linkId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentTransferConsumption_reportId_key" ON "ManualPaymentTransferConsumption"("reportId");

-- CreateIndex
CREATE INDEX "ManualPaymentTransferConsumption_tenantId_receivingAccountI_idx" ON "ManualPaymentTransferConsumption"("tenantId", "receivingAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentTransferConsumption_tenantId_identityDigest_key" ON "ManualPaymentTransferConsumption"("tenantId", "identityDigest");

-- CreateIndex
CREATE INDEX "ManualReceiptAssessment_tenantId_state_nextAttemptAt_idx" ON "ManualReceiptAssessment"("tenantId", "state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ManualReceiptAssessment_state_leaseExpiresAt_idx" ON "ManualReceiptAssessment"("state", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualReceiptAssessment_reportId_generation_pipelineVersion_key" ON "ManualReceiptAssessment"("reportId", "generation", "pipelineVersion");

-- CreateIndex
CREATE INDEX "ManualPaymentReport_attemptId_idx" ON "ManualPaymentReport"("attemptId");

-- AddForeignKey
ALTER TABLE "CustomerFundsRefundRequest" ADD CONSTRAINT "CustomerFundsRefundRequest_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "CustomerLedgerAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFundsRefundRequest" ADD CONSTRAINT "CustomerFundsRefundRequest_accountId_creditEntryId_fkey" FOREIGN KEY ("accountId", "creditEntryId") REFERENCES "CustomerLedgerEntry"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentReport" ADD CONSTRAINT "ManualPaymentReport_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ManualPaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentAttempt" ADD CONSTRAINT "ManualPaymentAttempt_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ManualPaymentLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentTransferConsumption" ADD CONSTRAINT "ManualPaymentTransferConsumption_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ManualPaymentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualReceiptAssessment" ADD CONSTRAINT "ManualReceiptAssessment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ManualPaymentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
