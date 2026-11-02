-- CreateEnum
CREATE TYPE "OwnerBillingSubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "OwnerBillingAccount" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerBillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerBillingPurchase" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "purchaseDigest" TEXT NOT NULL,
    "latestOrderDigest" TEXT,
    "productId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerBillingPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerBillingSubscription" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "environment" TEXT NOT NULL,
    "purchaseDigest" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "OwnerBillingSubscriptionStatus" NOT NULL,
    "currentPeriodEndsAt" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerBillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerBusinessCoverage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activeTenantId" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL,
    "enrolledByUserId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releasedByUserId" TEXT,

    CONSTRAINT "OwnerBusinessCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerBillingAccount_ownerUserId_key" ON "OwnerBillingAccount"("ownerUserId");

-- CreateIndex
CREATE INDEX "OwnerBillingPurchase_accountId_expiresAt_idx" ON "OwnerBillingPurchase"("accountId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerBillingPurchase_provider_purchaseDigest_key" ON "OwnerBillingPurchase"("provider", "purchaseDigest");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerBillingSubscription_accountId_key" ON "OwnerBillingSubscription"("accountId");

-- CreateIndex
CREATE INDEX "OwnerBillingSubscription_provider_purchaseDigest_idx" ON "OwnerBillingSubscription"("provider", "purchaseDigest");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerBusinessCoverage_activeTenantId_key" ON "OwnerBusinessCoverage"("activeTenantId");

-- CreateIndex
CREATE INDEX "OwnerBusinessCoverage_accountId_releasedAt_idx" ON "OwnerBusinessCoverage"("accountId", "releasedAt");

-- CreateIndex
CREATE INDEX "OwnerBusinessCoverage_tenantId_enrolledAt_idx" ON "OwnerBusinessCoverage"("tenantId", "enrolledAt");

-- AddForeignKey
ALTER TABLE "OwnerBillingAccount" ADD CONSTRAINT "OwnerBillingAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerBillingPurchase" ADD CONSTRAINT "OwnerBillingPurchase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OwnerBillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerBillingSubscription" ADD CONSTRAINT "OwnerBillingSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OwnerBillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerBusinessCoverage" ADD CONSTRAINT "OwnerBusinessCoverage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OwnerBillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerBusinessCoverage" ADD CONSTRAINT "OwnerBusinessCoverage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
