-- CreateTable
CREATE TABLE "AccountPrivacyRecordRetention" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordFamily" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "actorField" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "policyDigest" TEXT NOT NULL,
    "controllerEvidenceDigest" TEXT NOT NULL,
    "sourceEvidenceDigest" TEXT NOT NULL,
    "decisionDigest" TEXT NOT NULL,
    "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
    "assessmentYear" INTEGER,
    "closedAt" TIMESTAMP(3),
    "earlierExpiresAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewDueAt" TIMESTAMP(3) NOT NULL,
    "operatorUserId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "holdReason" TEXT,
    "holdOwnerUserId" TEXT,
    "holdReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPrivacyRecordRetention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountPrivacyRecordRetention_requestId_idx" ON "AccountPrivacyRecordRetention"("requestId");

-- CreateIndex
CREATE INDEX "AccountPrivacyRecordRetention_expiresAt_idx" ON "AccountPrivacyRecordRetention"("expiresAt");

-- CreateIndex
CREATE INDEX "AccountPrivacyRecordRetention_reviewedAt_reviewDueAt_idx" ON "AccountPrivacyRecordRetention"("reviewedAt", "reviewDueAt");

-- CreateIndex
CREATE INDEX "AccountPrivacyRecordRetention_tenantId_category_idx" ON "AccountPrivacyRecordRetention"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyRecordRetention_subjectUserId_recordFamily_re_key" ON "AccountPrivacyRecordRetention"("subjectUserId", "recordFamily", "recordId", "actorField");
