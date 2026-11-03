-- CreateTable
CREATE TABLE "PaymentReportOutcomeNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "decisionDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimId" TEXT,
    "sendStartedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReportOutcomeNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentReportOutcomeNotification_status_createdAt_idx" ON "PaymentReportOutcomeNotification"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReportOutcomeNotification_tenantId_reportId_recipien_key" ON "PaymentReportOutcomeNotification"("tenantId", "reportId", "recipientUserId");

-- AddForeignKey
ALTER TABLE "PaymentReportOutcomeNotification" ADD CONSTRAINT "PaymentReportOutcomeNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReportOutcomeNotification" ADD CONSTRAINT "PaymentReportOutcomeNotification_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ManualPaymentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReportOutcomeNotification" ADD CONSTRAINT "PaymentReportOutcomeNotification_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
