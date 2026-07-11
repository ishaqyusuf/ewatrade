-- CreateEnum
CREATE TYPE "BillingCheckoutSessionStatus" AS ENUM ('CREATED', 'PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "BillingProviderEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "BillingCheckoutSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tenantSubscriptionId" TEXT,
    "provider" "BillingProvider" NOT NULL DEFAULT 'NONE',
    "status" "BillingCheckoutSessionStatus" NOT NULL DEFAULT 'CREATED',
    "providerSessionId" TEXT,
    "checkoutUrl" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "surface" TEXT,
    "successUrl" TEXT,
    "cancelUrl" TEXT,
    "externalId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantSubscriptionId" TEXT,
    "planId" TEXT,
    "provider" "BillingProvider" NOT NULL DEFAULT 'NONE',
    "providerInvoiceId" TEXT,
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
    "amountDueMinor" INTEGER NOT NULL DEFAULT 0,
    "amountPaidMinor" INTEGER NOT NULL DEFAULT 0,
    "periodStartsAt" TIMESTAMP(3),
    "periodEndsAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "hostedInvoiceUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProviderEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" "BillingProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "BillingProviderEventStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckoutSession_provider_providerSessionId_key" ON "BillingCheckoutSession"("provider", "providerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckoutSession_tenantId_externalId_key" ON "BillingCheckoutSession"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "BillingCheckoutSession_tenantId_status_createdAt_idx" ON "BillingCheckoutSession"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingCheckoutSession_planId_createdAt_idx" ON "BillingCheckoutSession"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingCheckoutSession_requestedByUserId_createdAt_idx" ON "BillingCheckoutSession"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingCheckoutSession_expiresAt_idx" ON "BillingCheckoutSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_provider_providerInvoiceId_key" ON "BillingInvoice"("provider", "providerInvoiceId");

-- CreateIndex
CREATE INDEX "BillingInvoice_tenantId_status_issuedAt_idx" ON "BillingInvoice"("tenantId", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_tenantSubscriptionId_issuedAt_idx" ON "BillingInvoice"("tenantSubscriptionId", "issuedAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_planId_issuedAt_idx" ON "BillingInvoice"("planId", "issuedAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_dueAt_idx" ON "BillingInvoice"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProviderEvent_provider_eventId_key" ON "BillingProviderEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "BillingProviderEvent_tenantId_receivedAt_idx" ON "BillingProviderEvent"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "BillingProviderEvent_provider_status_receivedAt_idx" ON "BillingProviderEvent"("provider", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "BillingProviderEvent_type_receivedAt_idx" ON "BillingProviderEvent"("type", "receivedAt");

-- AddForeignKey
ALTER TABLE "BillingCheckoutSession" ADD CONSTRAINT "BillingCheckoutSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCheckoutSession" ADD CONSTRAINT "BillingCheckoutSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCheckoutSession" ADD CONSTRAINT "BillingCheckoutSession_tenantSubscriptionId_fkey" FOREIGN KEY ("tenantSubscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_tenantSubscriptionId_fkey" FOREIGN KEY ("tenantSubscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProviderEvent" ADD CONSTRAINT "BillingProviderEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
