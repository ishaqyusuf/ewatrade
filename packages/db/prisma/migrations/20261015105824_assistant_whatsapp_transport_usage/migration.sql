-- CreateEnum
CREATE TYPE "AssistantWhatsAppUsageWindow" AS ENUM ('MINUTE', 'DAY');

-- CreateTable
CREATE TABLE "AssistantWhatsAppUsageBucket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "windowKind" "AssistantWhatsAppUsageWindow" NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "windowEndsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ingress" INTEGER NOT NULL DEFAULT 0,
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantWhatsAppUsageBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantWhatsAppUsageBucket_userId_windowKind_windowStarte_idx" ON "AssistantWhatsAppUsageBucket"("userId", "windowKind", "windowStartedAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppUsageBucket_tenantId_windowKind_windowStar_idx" ON "AssistantWhatsAppUsageBucket"("tenantId", "windowKind", "windowStartedAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppUsageBucket_expiresAt_idx" ON "AssistantWhatsAppUsageBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppUsageBucket_tenantId_userId_windowKind_win_key" ON "AssistantWhatsAppUsageBucket"("tenantId", "userId", "windowKind", "windowStartedAt");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppUsageBucket" ADD CONSTRAINT "AssistantWhatsAppUsageBucket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppUsageBucket" ADD CONSTRAINT "AssistantWhatsAppUsageBucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
