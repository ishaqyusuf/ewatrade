-- CreateEnum
CREATE TYPE "ManualPaymentReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'NOT_RECEIVED');

-- AlterTable
ALTER TABLE "FinanceAccount" ADD COLUMN     "bankAccountHolder" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankName" TEXT;

-- CreateTable
CREATE TABLE "ManualPaymentLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "clientLinkId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "allowPartial" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT NOT NULL,
    "bankAccountNumber" TEXT NOT NULL,
    "bankAccountHolder" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPaymentReport" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "clientReportId" TEXT NOT NULL,
    "status" "ManualPaymentReportStatus" NOT NULL DEFAULT 'DRAFT',
    "claimedAmountMinor" INTEGER NOT NULL,
    "payerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "receiptContentType" TEXT,
    "receiptDigest" TEXT,
    "receiptSizeBytes" INTEGER,
    "receiptStoragePath" TEXT,
    "receiptProvider" TEXT,
    "receiptStoreId" TEXT,
    "receiptUploadedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "receivedAmountMinor" INTEGER,
    "receivedAccountId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "bankReference" TEXT,
    "decisionNote" TEXT,
    "decisionDigest" TEXT,
    "canonicalPaymentId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualPaymentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualPaymentLink_tenantId_orderId_createdAt_idx" ON "ManualPaymentLink"("tenantId", "orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentLink_tenantId_clientLinkId_key" ON "ManualPaymentLink"("tenantId", "clientLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentReport_canonicalPaymentId_key" ON "ManualPaymentReport"("canonicalPaymentId");

-- CreateIndex
CREATE INDEX "ManualPaymentReport_linkId_status_createdAt_idx" ON "ManualPaymentReport"("linkId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ManualPaymentReport_status_submittedAt_id_idx" ON "ManualPaymentReport"("status", "submittedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentReport_linkId_clientReportId_key" ON "ManualPaymentReport"("linkId", "clientReportId");

-- AddForeignKey
ALTER TABLE "ManualPaymentLink" ADD CONSTRAINT "ManualPaymentLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentLink" ADD CONSTRAINT "ManualPaymentLink_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "CommercialOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentLink" ADD CONSTRAINT "ManualPaymentLink_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentReport" ADD CONSTRAINT "ManualPaymentReport_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ManualPaymentLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
