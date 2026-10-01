-- CreateEnum
CREATE TYPE "AccountPrivacyNoticeAttemptStatus" AS ENUM ('PREPARED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'UNCERTAIN');

-- CreateTable
CREATE TABLE "AccountPrivacyNoticeAttempt" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AccountPrivacyNoticeAttemptStatus" NOT NULL DEFAULT 'PREPARED',
    "policyVersion" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "recipientDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "providerEventId" TEXT,
    "deliveryEvidenceDigest" TEXT,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPrivacyNoticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyNoticeAttempt_idempotencyKey_key" ON "AccountPrivacyNoticeAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyNoticeAttempt_providerMessageId_key" ON "AccountPrivacyNoticeAttempt"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyNoticeAttempt_providerEventId_key" ON "AccountPrivacyNoticeAttempt"("providerEventId");

-- CreateIndex
CREATE INDEX "AccountPrivacyNoticeAttempt_requestId_status_idx" ON "AccountPrivacyNoticeAttempt"("requestId", "status");

-- CreateIndex
CREATE INDEX "AccountPrivacyNoticeAttempt_userId_preparedAt_idx" ON "AccountPrivacyNoticeAttempt"("userId", "preparedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyNoticeAttempt_requestId_attemptNumber_key" ON "AccountPrivacyNoticeAttempt"("requestId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "AccountPrivacyNoticeAttempt" ADD CONSTRAINT "AccountPrivacyNoticeAttempt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AccountPrivacyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
