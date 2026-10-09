-- CreateTable
CREATE TABLE "AccountPrivacyRetention" (
    "requestId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "policyDigest" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "contactExpiresAt" TIMESTAMP(3) NOT NULL,
    "reviewDueAt" TIMESTAMP(3) NOT NULL,
    "evidenceExpiresAt" TIMESTAMP(3) NOT NULL,
    "contactClearedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "holdReason" TEXT,
    "holdOwnerUserId" TEXT,
    "holdReviewAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPrivacyRetention_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "ProductAnalyticsEvent" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "envelope" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "ProductAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountPrivacyRetention_contactClearedAt_contactExpiresAt_idx" ON "AccountPrivacyRetention"("contactClearedAt", "contactExpiresAt");

-- CreateIndex
CREATE INDEX "AccountPrivacyRetention_reviewedAt_reviewDueAt_idx" ON "AccountPrivacyRetention"("reviewedAt", "reviewDueAt");

-- CreateIndex
CREATE INDEX "AccountPrivacyRetention_evidenceExpiresAt_idx" ON "AccountPrivacyRetention"("evidenceExpiresAt");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_deliveredAt_availableAt_leaseUntil_idx" ON "ProductAnalyticsEvent"("deliveredAt", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_expiresAt_idx" ON "ProductAnalyticsEvent"("expiresAt");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_userId_idx" ON "ProductAnalyticsEvent"("userId");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_tenantId_idx" ON "ProductAnalyticsEvent"("tenantId");

-- AddForeignKey
ALTER TABLE "AccountPrivacyRetention" ADD CONSTRAINT "AccountPrivacyRetention_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AccountPrivacyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAnalyticsEvent" ADD CONSTRAINT "ProductAnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAnalyticsEvent" ADD CONSTRAINT "ProductAnalyticsEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
