-- CreateEnum
CREATE TYPE "DomainProvider" AS ENUM ('GO54', 'OPENPROVIDER', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "DomainQuoteOperation" AS ENUM ('REGISTER', 'RENEW');

-- CreateEnum
CREATE TYPE "DomainQuoteStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DomainOrderType" AS ENUM ('REGISTER', 'RENEW');

-- CreateEnum
CREATE TYPE "DomainPaymentStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DomainRegistrationStatus" AS ENUM ('PENDING', 'REGISTERING', 'REGISTERED', 'UNCERTAIN', 'FAILED');

-- CreateEnum
CREATE TYPE "ManagedDomainStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REDEMPTION', 'SUSPENDED', 'TRANSFERRED_OUT', 'FAILED');

-- CreateEnum
CREATE TYPE "DomainConnectionType" AS ENUM ('MANAGED', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "DomainConnectionStatus" AS ENUM ('OWNERSHIP_PENDING', 'DNS_CONFIGURING', 'VERIFYING', 'ACTIVE', 'FAILED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "DomainRenewalMode" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "DomainOperationKind" AS ENUM ('REGISTER', 'RENEW', 'REFUND', 'CONNECT', 'VERIFY', 'TRANSFER', 'RECONCILE');

-- CreateEnum
CREATE TYPE "DomainOperationStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'UNCERTAIN', 'FAILED');

-- CreateTable
CREATE TABLE "DomainRegistrantProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "maskedEmail" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "providerHandles" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainRegistrantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" "DomainProvider" NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "tld" TEXT NOT NULL,
    "operation" "DomainQuoteOperation" NOT NULL DEFAULT 'REGISTER',
    "providerCostMinor" INTEGER NOT NULL,
    "providerCurrencyCode" TEXT NOT NULL,
    "retailPriceMinor" INTEGER NOT NULL,
    "renewalPriceMinor" INTEGER,
    "retailCurrencyCode" TEXT NOT NULL DEFAULT 'NGN',
    "exchangeRate" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "status" "DomainQuoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "registrantProfileId" TEXT NOT NULL,
    "managedDomainId" TEXT,
    "type" "DomainOrderType" NOT NULL DEFAULT 'REGISTER',
    "provider" "DomainProvider" NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "paymentStatus" "DomainPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "registrationStatus" "DomainRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
    "providerCostMinor" INTEGER NOT NULL,
    "providerCurrencyCode" TEXT NOT NULL,
    "exchangeRate" TEXT,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "registrationStartedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "siteId" TEXT,
    "registrantProfileId" TEXT NOT NULL,
    "provider" "DomainProvider" NOT NULL,
    "providerDomainId" TEXT,
    "providerCustomerHandle" TEXT,
    "hostname" TEXT NOT NULL,
    "tld" TEXT NOT NULL,
    "status" "ManagedDomainStatus" NOT NULL DEFAULT 'PENDING',
    "renewalMode" "DomainRenewalMode" NOT NULL DEFAULT 'MANUAL',
    "registeredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "siteId" TEXT,
    "managedDomainId" TEXT,
    "hostname" TEXT NOT NULL,
    "type" "DomainConnectionType" NOT NULL,
    "status" "DomainConnectionStatus" NOT NULL DEFAULT 'OWNERSHIP_PENDING',
    "ownershipTokenHash" TEXT,
    "verificationRecordType" TEXT,
    "verificationRecordName" TEXT,
    "verificationRecordValue" TEXT,
    "vercelProjectId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "activeAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT,
    "managedDomainId" TEXT,
    "connectionId" TEXT,
    "kind" "DomainOperationKind" NOT NULL,
    "status" "DomainOperationStatus" NOT NULL,
    "provider" "DomainProvider",
    "providerEventId" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainOperationAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT,
    "managedDomainId" TEXT,
    "connectionId" TEXT,
    "kind" "DomainOperationKind" NOT NULL,
    "provider" "DomainProvider" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "status" "DomainOperationStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "responseMetadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainOperationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainRegistrantProfile_tenantId_key" ON "DomainRegistrantProfile"("tenantId");

-- CreateIndex
CREATE INDEX "DomainRegistrantProfile_tenantId_updatedAt_idx" ON "DomainRegistrantProfile"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "DomainQuote_tenantId_storeId_status_expiresAt_idx" ON "DomainQuote"("tenantId", "storeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "DomainQuote_normalizedDomain_provider_expiresAt_idx" ON "DomainQuote"("normalizedDomain", "provider", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DomainOrder_quoteId_key" ON "DomainOrder"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainOrder_managedDomainId_key" ON "DomainOrder"("managedDomainId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainOrder_paymentReference_key" ON "DomainOrder"("paymentReference");

-- CreateIndex
CREATE INDEX "DomainOrder_tenantId_storeId_createdAt_idx" ON "DomainOrder"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "DomainOrder_paymentStatus_registrationStatus_updatedAt_idx" ON "DomainOrder"("paymentStatus", "registrationStatus", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DomainOrder_tenantId_idempotencyKey_key" ON "DomainOrder"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedDomain_hostname_key" ON "ManagedDomain"("hostname");

-- CreateIndex
CREATE INDEX "ManagedDomain_tenantId_storeId_status_idx" ON "ManagedDomain"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "ManagedDomain_provider_providerDomainId_idx" ON "ManagedDomain"("provider", "providerDomainId");

-- CreateIndex
CREATE INDEX "ManagedDomain_status_expiresAt_idx" ON "ManagedDomain"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DomainConnection_hostname_key" ON "DomainConnection"("hostname");

-- CreateIndex
CREATE INDEX "DomainConnection_tenantId_storeId_status_idx" ON "DomainConnection"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "DomainConnection_managedDomainId_status_idx" ON "DomainConnection"("managedDomainId", "status");

-- CreateIndex
CREATE INDEX "DomainEvent_tenantId_occurredAt_idx" ON "DomainEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEvent_orderId_occurredAt_idx" ON "DomainEvent"("orderId", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEvent_managedDomainId_occurredAt_idx" ON "DomainEvent"("managedDomainId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEvent_provider_providerEventId_key" ON "DomainEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "DomainOperationAttempt_orderId_kind_status_idx" ON "DomainOperationAttempt"("orderId", "kind", "status");

-- CreateIndex
CREATE INDEX "DomainOperationAttempt_managedDomainId_kind_status_idx" ON "DomainOperationAttempt"("managedDomainId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DomainOperationAttempt_tenantId_idempotencyKey_key" ON "DomainOperationAttempt"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "DomainRegistrantProfile" ADD CONSTRAINT "DomainRegistrantProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainQuote" ADD CONSTRAINT "DomainQuote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainQuote" ADD CONSTRAINT "DomainQuote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOrder" ADD CONSTRAINT "DomainOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOrder" ADD CONSTRAINT "DomainOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOrder" ADD CONSTRAINT "DomainOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "DomainQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOrder" ADD CONSTRAINT "DomainOrder_registrantProfileId_fkey" FOREIGN KEY ("registrantProfileId") REFERENCES "DomainRegistrantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOrder" ADD CONSTRAINT "DomainOrder_managedDomainId_fkey" FOREIGN KEY ("managedDomainId") REFERENCES "ManagedDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedDomain" ADD CONSTRAINT "ManagedDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedDomain" ADD CONSTRAINT "ManagedDomain_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedDomain" ADD CONSTRAINT "ManagedDomain_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedDomain" ADD CONSTRAINT "ManagedDomain_registrantProfileId_fkey" FOREIGN KEY ("registrantProfileId") REFERENCES "DomainRegistrantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainConnection" ADD CONSTRAINT "DomainConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainConnection" ADD CONSTRAINT "DomainConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainConnection" ADD CONSTRAINT "DomainConnection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainConnection" ADD CONSTRAINT "DomainConnection_managedDomainId_fkey" FOREIGN KEY ("managedDomainId") REFERENCES "ManagedDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DomainOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_managedDomainId_fkey" FOREIGN KEY ("managedDomainId") REFERENCES "ManagedDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DomainConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOperationAttempt" ADD CONSTRAINT "DomainOperationAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOperationAttempt" ADD CONSTRAINT "DomainOperationAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DomainOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOperationAttempt" ADD CONSTRAINT "DomainOperationAttempt_managedDomainId_fkey" FOREIGN KEY ("managedDomainId") REFERENCES "ManagedDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOperationAttempt" ADD CONSTRAINT "DomainOperationAttempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DomainConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
