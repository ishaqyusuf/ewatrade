-- CreateEnum
CREATE TYPE "PlayRefundReviewPreference" AS ENUM ('APPROVE', 'DECLINE', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "PlayRefundReviewResponseStatus" AS ENUM ('PREPARED', 'CLAIMED', 'CONFIRMED', 'UNCERTAIN');

-- CreateTable
CREATE TABLE "PlayRefundReviewResponse" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "preference" "PlayRefundReviewPreference" NOT NULL,
    "sampleContentProvided" BOOLEAN NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "status" "PlayRefundReviewResponseStatus" NOT NULL DEFAULT 'PREPARED',
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "uncertainAt" TIMESTAMP(3),

    CONSTRAINT "PlayRefundReviewResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayRefundReviewResponse_caseId_key" ON "PlayRefundReviewResponse"("caseId");

-- CreateIndex
CREATE INDEX "PlayRefundReviewResponse_status_preparedAt_idx" ON "PlayRefundReviewResponse"("status", "preparedAt");

-- CreateIndex
CREATE INDEX "PlayRefundReviewResponse_actorUserId_preparedAt_idx" ON "PlayRefundReviewResponse"("actorUserId", "preparedAt");

-- AddForeignKey
ALTER TABLE "PlayRefundReviewResponse" ADD CONSTRAINT "PlayRefundReviewResponse_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PlayRefundReviewCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
