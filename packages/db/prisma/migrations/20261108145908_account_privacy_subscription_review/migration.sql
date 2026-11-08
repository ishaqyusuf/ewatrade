-- CreateTable
CREATE TABLE "AccountPrivacySubscriptionReview" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "policyDigest" TEXT NOT NULL,
    "inventoryDigest" TEXT NOT NULL,
    "controllerEvidenceDigest" TEXT NOT NULL,
    "decisionDigest" TEXT NOT NULL,
    "decisions" JSONB NOT NULL,
    "operatorUserId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountPrivacySubscriptionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacySubscriptionReview_decisionDigest_key" ON "AccountPrivacySubscriptionReview"("decisionDigest");

-- CreateIndex
CREATE INDEX "AccountPrivacySubscriptionReview_requestId_reviewedAt_idx" ON "AccountPrivacySubscriptionReview"("requestId", "reviewedAt");

-- CreateIndex
CREATE INDEX "AccountPrivacySubscriptionReview_subjectUserId_reviewedAt_idx" ON "AccountPrivacySubscriptionReview"("subjectUserId", "reviewedAt");

-- CreateIndex
CREATE INDEX "AccountPrivacySubscriptionReview_supersededAt_nextReviewAt_idx" ON "AccountPrivacySubscriptionReview"("supersededAt", "nextReviewAt");
