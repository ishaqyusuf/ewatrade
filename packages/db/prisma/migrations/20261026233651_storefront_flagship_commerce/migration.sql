-- CreateEnum
CREATE TYPE "StorefrontOrderRequestStatus" AS ENUM ('SUBMITTED', 'NEEDS_INFORMATION', 'CONFIRMED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "StorefrontFulfilmentMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "StorefrontObservedAvailability" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StorefrontRequestKind" AS ENUM ('ORDER', 'SERVICE');

-- CreateEnum
CREATE TYPE "StorefrontRequestMessageAuthor" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "StorefrontMerchantAlertStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "StorefrontCustomerIdentifierKind" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "StorefrontCustomerOtpStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED');

-- CreateTable
CREATE TABLE "StorefrontOrderRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "StorefrontOrderRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerId" TEXT,
    "fulfilment" "StorefrontFulfilmentMethod" NOT NULL,
    "deliveryAddress" TEXT,
    "notes" TEXT,
    "currencyCode" TEXT NOT NULL,
    "observedSubtotalMinor" INTEGER NOT NULL,
    "staffResponse" TEXT,
    "deliveryFeeMinor" INTEGER,
    "confirmedOrderId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "receiptTokenDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontOrderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontOrderRequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "offeringId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "unitLabel" TEXT,
    "quantity" DECIMAL(38,6) NOT NULL,
    "observedUnitPriceMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "observedAvailability" "StorefrontObservedAvailability" NOT NULL,

    CONSTRAINT "StorefrontOrderRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontServiceRequestContext" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceRequestId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "receiptTokenDigest" TEXT NOT NULL,
    "customerId" TEXT,
    "collectionAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontServiceRequestContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontRequestMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "StorefrontRequestKind" NOT NULL,
    "orderRequestId" TEXT,
    "serviceContextId" TEXT,
    "author" "StorefrontRequestMessageAuthor" NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontRequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontMerchantAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" "StorefrontRequestKind" NOT NULL,
    "orderRequestId" TEXT,
    "serviceContextId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "dedupeKey" TEXT NOT NULL,
    "status" "StorefrontMerchantAlertStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimId" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontMerchantAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontCustomer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailNormalized" TEXT,
    "phoneE164" TEXT,
    "displayName" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontCustomerOtpChallenge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "StorefrontCustomerIdentifierKind" NOT NULL,
    "identifier" TEXT,
    "identifierDigest" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "StorefrontCustomerOtpStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "networkDigest" TEXT,
    "deliveryAdapter" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontCustomerOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontCustomerSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontCustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontOrderRequest_confirmedOrderId_key" ON "StorefrontOrderRequest"("confirmedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontOrderRequest_receiptTokenDigest_key" ON "StorefrontOrderRequest"("receiptTokenDigest");

-- CreateIndex
CREATE INDEX "StorefrontOrderRequest_tenantId_storeId_status_createdAt_idx" ON "StorefrontOrderRequest"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontOrderRequest_customerId_createdAt_idx" ON "StorefrontOrderRequest"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontOrderRequest_tenantId_clientRequestId_key" ON "StorefrontOrderRequest"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontOrderRequest_tenantId_reference_key" ON "StorefrontOrderRequest"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "StorefrontOrderRequestLine_offeringId_idx" ON "StorefrontOrderRequestLine"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontOrderRequestLine_requestId_position_key" ON "StorefrontOrderRequestLine"("requestId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontServiceRequestContext_serviceRequestId_key" ON "StorefrontServiceRequestContext"("serviceRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontServiceRequestContext_receiptTokenDigest_key" ON "StorefrontServiceRequestContext"("receiptTokenDigest");

-- CreateIndex
CREATE INDEX "StorefrontServiceRequestContext_customerId_createdAt_idx" ON "StorefrontServiceRequestContext"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontServiceRequestContext_tenantId_reference_key" ON "StorefrontServiceRequestContext"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "StorefrontRequestMessage_orderRequestId_createdAt_idx" ON "StorefrontRequestMessage"("orderRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontRequestMessage_serviceContextId_createdAt_idx" ON "StorefrontRequestMessage"("serviceContextId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontRequestMessage_tenantId_clientMessageId_key" ON "StorefrontRequestMessage"("tenantId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontMerchantAlert_dedupeKey_key" ON "StorefrontMerchantAlert"("dedupeKey");

-- CreateIndex
CREATE INDEX "StorefrontMerchantAlert_status_nextAttemptAt_idx" ON "StorefrontMerchantAlert"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StorefrontMerchantAlert_tenantId_storeId_createdAt_idx" ON "StorefrontMerchantAlert"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontCustomer_tenantId_emailNormalized_key" ON "StorefrontCustomer"("tenantId", "emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontCustomer_tenantId_phoneE164_key" ON "StorefrontCustomer"("tenantId", "phoneE164");

-- CreateIndex
CREATE INDEX "StorefrontCustomerOtpChallenge_tenantId_identifierDigest_cr_idx" ON "StorefrontCustomerOtpChallenge"("tenantId", "identifierDigest", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontCustomerOtpChallenge_tenantId_networkDigest_creat_idx" ON "StorefrontCustomerOtpChallenge"("tenantId", "networkDigest", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontCustomerSession_tokenDigest_key" ON "StorefrontCustomerSession"("tokenDigest");

-- CreateIndex
CREATE INDEX "StorefrontCustomerSession_customerId_createdAt_idx" ON "StorefrontCustomerSession"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "StorefrontOrderRequest" ADD CONSTRAINT "StorefrontOrderRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrderRequest" ADD CONSTRAINT "StorefrontOrderRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrderRequest" ADD CONSTRAINT "StorefrontOrderRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StorefrontCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrderRequest" ADD CONSTRAINT "StorefrontOrderRequest_confirmedOrderId_fkey" FOREIGN KEY ("confirmedOrderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrderRequestLine" ADD CONSTRAINT "StorefrontOrderRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StorefrontOrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontServiceRequestContext" ADD CONSTRAINT "StorefrontServiceRequestContext_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontServiceRequestContext" ADD CONSTRAINT "StorefrontServiceRequestContext_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontServiceRequestContext" ADD CONSTRAINT "StorefrontServiceRequestContext_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StorefrontCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontRequestMessage" ADD CONSTRAINT "StorefrontRequestMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontRequestMessage" ADD CONSTRAINT "StorefrontRequestMessage_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES "StorefrontOrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontRequestMessage" ADD CONSTRAINT "StorefrontRequestMessage_serviceContextId_fkey" FOREIGN KEY ("serviceContextId") REFERENCES "StorefrontServiceRequestContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontMerchantAlert" ADD CONSTRAINT "StorefrontMerchantAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontMerchantAlert" ADD CONSTRAINT "StorefrontMerchantAlert_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES "StorefrontOrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontMerchantAlert" ADD CONSTRAINT "StorefrontMerchantAlert_serviceContextId_fkey" FOREIGN KEY ("serviceContextId") REFERENCES "StorefrontServiceRequestContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontCustomer" ADD CONSTRAINT "StorefrontCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontCustomerOtpChallenge" ADD CONSTRAINT "StorefrontCustomerOtpChallenge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontCustomerSession" ADD CONSTRAINT "StorefrontCustomerSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontCustomerSession" ADD CONSTRAINT "StorefrontCustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StorefrontCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
