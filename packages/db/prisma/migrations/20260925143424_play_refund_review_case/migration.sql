-- CreateTable
CREATE TABLE "PlayRefundReviewCase" (
    "id" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "encryptedPendingToken" TEXT NOT NULL,
    "encryptionKeyId" TEXT NOT NULL,
    "orderDigest" TEXT NOT NULL,
    "accountDigest" TEXT,
    "tenantId" TEXT,
    "refundReason" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayRefundReviewCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayRefundReviewCase_tokenDigest_key" ON "PlayRefundReviewCase"("tokenDigest");

-- CreateIndex
CREATE INDEX "PlayRefundReviewCase_responseDueAt_idx" ON "PlayRefundReviewCase"("responseDueAt");

-- CreateIndex
CREATE INDEX "PlayRefundReviewCase_tenantId_responseDueAt_idx" ON "PlayRefundReviewCase"("tenantId", "responseDueAt");

-- CreateIndex
CREATE INDEX "PlayRefundReviewCase_orderDigest_idx" ON "PlayRefundReviewCase"("orderDigest");

-- AddForeignKey
ALTER TABLE "PlayRefundReviewCase" ADD CONSTRAINT "PlayRefundReviewCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
