-- AlterTable
ALTER TABLE "AccountPrivacyNoticeAttempt" ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureEventId" TEXT,
ADD COLUMN     "failureEvidenceDigest" TEXT;

-- CreateIndex
CREATE INDEX "AccountPrivacyNoticeAttempt_failureEventId_idx" ON "AccountPrivacyNoticeAttempt"("failureEventId");
