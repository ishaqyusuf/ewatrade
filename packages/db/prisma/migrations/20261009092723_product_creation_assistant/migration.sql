-- AlterEnum
ALTER TYPE "AssistantConversationPurpose" ADD VALUE 'PRODUCT_CREATE';

-- AlterTable
ALTER TABLE "AssistantConversation" ADD COLUMN     "workflowContext" JSONB;

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
CREATE INDEX "ProductAnalyticsEvent_deliveredAt_availableAt_leaseUntil_idx" ON "ProductAnalyticsEvent"("deliveredAt", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_expiresAt_idx" ON "ProductAnalyticsEvent"("expiresAt");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_userId_idx" ON "ProductAnalyticsEvent"("userId");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_tenantId_idx" ON "ProductAnalyticsEvent"("tenantId");

-- AddForeignKey
ALTER TABLE "ProductAnalyticsEvent" ADD CONSTRAINT "ProductAnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAnalyticsEvent" ADD CONSTRAINT "ProductAnalyticsEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
