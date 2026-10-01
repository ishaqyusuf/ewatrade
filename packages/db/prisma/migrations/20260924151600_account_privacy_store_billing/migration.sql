-- CreateEnum
CREATE TYPE "AccountPrivacyRequestStatus" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AccountPrivacyRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "requestKey" TEXT NOT NULL,
    "status" "AccountPrivacyRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "outcome" JSONB,

    CONSTRAINT "AccountPrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreBillingAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreBillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSubscriptionPurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "purchaseDigest" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSubscriptionPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyRequest_requestKey_key" ON "AccountPrivacyRequest"("requestKey");

-- CreateIndex
CREATE INDEX "AccountPrivacyRequest_userId_requestedAt_idx" ON "AccountPrivacyRequest"("userId", "requestedAt");

-- CreateIndex
CREATE INDEX "AccountPrivacyRequest_status_requestedAt_idx" ON "AccountPrivacyRequest"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalAcceptance_userId_version_key" ON "LegalAcceptance"("userId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "StoreBillingAccount_tenantId_key" ON "StoreBillingAccount"("tenantId");

-- CreateIndex
CREATE INDEX "StoreSubscriptionPurchase_tenantId_expiresAt_idx" ON "StoreSubscriptionPurchase"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSubscriptionPurchase_provider_purchaseDigest_key" ON "StoreSubscriptionPurchase"("provider", "purchaseDigest");

-- AddForeignKey
ALTER TABLE "AccountPrivacyRequest" ADD CONSTRAINT "AccountPrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreBillingAccount" ADD CONSTRAINT "StoreBillingAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSubscriptionPurchase" ADD CONSTRAINT "StoreSubscriptionPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
