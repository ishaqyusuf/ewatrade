-- CreateTable
CREATE TABLE "BusinessGrowthSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "stage" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "businessCreatedAt" TIMESTAMP(3) NOT NULL,
    "activeDays28" INTEGER NOT NULL,
    "ordersLast7" INTEGER NOT NULL,
    "ordersThisMonth" INTEGER NOT NULL,
    "ordersTotal" INTEGER NOT NULL,
    "salesMinorThisMonth" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "catalogItems" INTEGER NOT NULL,
    "staffCount" INTEGER NOT NULL,
    "businessesOwned" INTEGER NOT NULL,
    "moneyAccounts" INTEGER NOT NULL,
    "storefrontPublished" BOOLEAN NOT NULL,
    "customDomain" BOOLEAN NOT NULL,
    "whatsappLinked" BOOLEAN NOT NULL,
    "telegramLinked" BOOLEAN NOT NULL,
    "waRepliesUsed" INTEGER,
    "waRepliesCap" INTEGER,
    "limitPressure" JSONB NOT NULL,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessGrowthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "suppressedReason" TEXT,
    "senderUserId" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "conversionRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifecycleMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingPreference" (
    "userId" TEXT NOT NULL,
    "productTips" BOOLEAN NOT NULL DEFAULT true,
    "offers" BOOLEAN NOT NULL DEFAULT true,
    "monthlyReport" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribedAllAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "BusinessGrowthSnapshot_day_stage_idx" ON "BusinessGrowthSnapshot"("day", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessGrowthSnapshot_tenantId_day_key" ON "BusinessGrowthSnapshot"("tenantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleMessage_providerMessageId_key" ON "LifecycleMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "LifecycleMessage_status_createdAt_idx" ON "LifecycleMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LifecycleMessage_playId_sentAt_idx" ON "LifecycleMessage"("playId", "sentAt");

-- CreateIndex
CREATE INDEX "LifecycleMessage_userId_sentAt_idx" ON "LifecycleMessage"("userId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleMessage_tenantId_userId_playId_periodKey_key" ON "LifecycleMessage"("tenantId", "userId", "playId", "periodKey");

-- AddForeignKey
ALTER TABLE "BusinessGrowthSnapshot" ADD CONSTRAINT "BusinessGrowthSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleMessage" ADD CONSTRAINT "LifecycleMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleMessage" ADD CONSTRAINT "LifecycleMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPreference" ADD CONSTRAINT "MarketingPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

