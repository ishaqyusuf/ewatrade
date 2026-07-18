/*
  Warnings:

  - A unique constraint covering the columns `[storeId,legacyServiceItemId]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[productId,legacyServiceVariantId]` on the table `ProductVariant` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CatalogItemKind" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "ServiceFulfillmentMode" AS ENUM ('IMMEDIATE', 'TRACKED');

-- CreateEnum
CREATE TYPE "ServiceJobStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceJobEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'DELAYED', 'DUE_DATE_CHANGED', 'NOTE_ADDED', 'EVIDENCE_ADDED');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CONVERTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceNotificationIntentType" AS ENUM ('READY', 'DELAY');

-- CreateEnum
CREATE TYPE "ServiceNotificationIntentStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ServiceNotificationChannel" AS ENUM ('MANUAL', 'EMAIL', 'SMS', 'WHATSAPP');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "kindSnapshot" "CatalogItemKind" NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "category" TEXT,
ADD COLUMN     "kind" "CatalogItemKind" NOT NULL DEFAULT 'PRODUCT',
ADD COLUMN     "legacyServiceItemId" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "legacyServiceVariantId" TEXT;

-- CreateTable
CREATE TABLE "ServiceItemProfile" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "estimatedTurnaroundHours" INTEGER,
    "instructions" TEXT,
    "fulfillmentMode" "ServiceFulfillmentMode" NOT NULL DEFAULT 'TRACKED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceItemProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "retailOpsCustomerId" TEXT,
    "trackingToken" TEXT NOT NULL,
    "status" "ServiceJobStatus" NOT NULL DEFAULT 'RECEIVED',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "assignedUserId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'sale',
    "legacyId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceJobLine" (
    "id" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "variantNameSnapshot" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "totalPriceMinor" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceJobLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceJobEvent" (
    "id" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "ServiceJobEventType" NOT NULL,
    "fromStatus" "ServiceJobStatus",
    "toStatus" "ServiceJobStatus",
    "note" TEXT,
    "revisedDueAt" TIMESTAMP(3),
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceJobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceJobEvidence" (
    "id" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "mediaType" TEXT,
    "legacyId" TEXT,
    "metadata" JSONB,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceJobEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "disabledAt" TIMESTAMP(3),
    "legacyId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequestLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestLinkId" TEXT NOT NULL,
    "convertedOrderId" TEXT,
    "retailOpsCustomerId" TEXT,
    "trackingToken" TEXT NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "notes" TEXT,
    "totalMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
    "legacyId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "variantNameSnapshot" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "totalPriceMinor" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceNotificationIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "type" "ServiceNotificationIntentType" NOT NULL,
    "channel" "ServiceNotificationChannel" NOT NULL DEFAULT 'MANUAL',
    "status" "ServiceNotificationIntentStatus" NOT NULL DEFAULT 'PENDING',
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "manualCopy" TEXT NOT NULL,
    "providerId" TEXT,
    "failureReason" TEXT,
    "dedupeKey" TEXT,
    "legacyId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNotificationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceItemProfile_productId_key" ON "ServiceItemProfile"("productId");

-- CreateIndex
CREATE INDEX "ServiceItemProfile_fulfillmentMode_idx" ON "ServiceItemProfile"("fulfillmentMode");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJob_orderId_key" ON "ServiceJob"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJob_trackingToken_key" ON "ServiceJob"("trackingToken");

-- CreateIndex
CREATE INDEX "ServiceJob_tenantId_storeId_status_dueAt_idx" ON "ServiceJob"("tenantId", "storeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ServiceJob_retailOpsCustomerId_createdAt_idx" ON "ServiceJob"("retailOpsCustomerId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceJob_assignedUserId_status_idx" ON "ServiceJob"("assignedUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJob_tenantId_storeId_legacyId_key" ON "ServiceJob"("tenantId", "storeId", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJobLine_orderItemId_key" ON "ServiceJobLine"("orderItemId");

-- CreateIndex
CREATE INDEX "ServiceJobLine_serviceJobId_createdAt_idx" ON "ServiceJobLine"("serviceJobId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceJobLine_productId_createdAt_idx" ON "ServiceJobLine"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceJobLine_productVariantId_idx" ON "ServiceJobLine"("productVariantId");

-- CreateIndex
CREATE INDEX "ServiceJobEvent_serviceJobId_happenedAt_idx" ON "ServiceJobEvent"("serviceJobId", "happenedAt");

-- CreateIndex
CREATE INDEX "ServiceJobEvent_actorUserId_happenedAt_idx" ON "ServiceJobEvent"("actorUserId", "happenedAt");

-- CreateIndex
CREATE INDEX "ServiceJobEvent_type_happenedAt_idx" ON "ServiceJobEvent"("type", "happenedAt");

-- CreateIndex
CREATE INDEX "ServiceJobEvidence_serviceJobId_addedAt_idx" ON "ServiceJobEvidence"("serviceJobId", "addedAt");

-- CreateIndex
CREATE INDEX "ServiceJobEvidence_actorUserId_addedAt_idx" ON "ServiceJobEvidence"("actorUserId", "addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJobEvidence_serviceJobId_legacyId_key" ON "ServiceJobEvidence"("serviceJobId", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequestLink_token_key" ON "ServiceRequestLink"("token");

-- CreateIndex
CREATE INDEX "ServiceRequestLink_tenantId_storeId_disabledAt_idx" ON "ServiceRequestLink"("tenantId", "storeId", "disabledAt");

-- CreateIndex
CREATE INDEX "ServiceRequestLink_createdByUserId_createdAt_idx" ON "ServiceRequestLink"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequestLink_tenantId_storeId_legacyId_key" ON "ServiceRequestLink"("tenantId", "storeId", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_convertedOrderId_key" ON "ServiceRequest"("convertedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_trackingToken_key" ON "ServiceRequest"("trackingToken");

-- CreateIndex
CREATE INDEX "ServiceRequest_tenantId_storeId_status_createdAt_idx" ON "ServiceRequest"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_requestLinkId_createdAt_idx" ON "ServiceRequest"("requestLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_retailOpsCustomerId_createdAt_idx" ON "ServiceRequest"("retailOpsCustomerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_tenantId_storeId_legacyId_key" ON "ServiceRequest"("tenantId", "storeId", "legacyId");

-- CreateIndex
CREATE INDEX "ServiceRequestLine_requestId_createdAt_idx" ON "ServiceRequestLine"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequestLine_productId_idx" ON "ServiceRequestLine"("productId");

-- CreateIndex
CREATE INDEX "ServiceRequestLine_productVariantId_idx" ON "ServiceRequestLine"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceNotificationIntent_dedupeKey_key" ON "ServiceNotificationIntent"("dedupeKey");

-- CreateIndex
CREATE INDEX "ServiceNotificationIntent_tenantId_storeId_status_createdAt_idx" ON "ServiceNotificationIntent"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceNotificationIntent_serviceJobId_createdAt_idx" ON "ServiceNotificationIntent"("serviceJobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceNotificationIntent_tenantId_storeId_legacyId_key" ON "ServiceNotificationIntent"("tenantId", "storeId", "legacyId");

-- CreateIndex
CREATE INDEX "Product_storeId_kind_status_idx" ON "Product"("storeId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_storeId_legacyServiceItemId_key" ON "Product"("storeId", "legacyServiceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_legacyServiceVariantId_key" ON "ProductVariant"("productId", "legacyServiceVariantId");

-- AddForeignKey
ALTER TABLE "ServiceItemProfile" ADD CONSTRAINT "ServiceItemProfile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_retailOpsCustomerId_fkey" FOREIGN KEY ("retailOpsCustomerId") REFERENCES "RetailOpsCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLine" ADD CONSTRAINT "ServiceJobLine_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLine" ADD CONSTRAINT "ServiceJobLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLine" ADD CONSTRAINT "ServiceJobLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLine" ADD CONSTRAINT "ServiceJobLine_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobEvent" ADD CONSTRAINT "ServiceJobEvent_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobEvidence" ADD CONSTRAINT "ServiceJobEvidence_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestLink" ADD CONSTRAINT "ServiceRequestLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestLink" ADD CONSTRAINT "ServiceRequestLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_requestLinkId_fkey" FOREIGN KEY ("requestLinkId") REFERENCES "ServiceRequestLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_retailOpsCustomerId_fkey" FOREIGN KEY ("retailOpsCustomerId") REFERENCES "RetailOpsCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestLine" ADD CONSTRAINT "ServiceRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestLine" ADD CONSTRAINT "ServiceRequestLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestLine" ADD CONSTRAINT "ServiceRequestLine_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNotificationIntent" ADD CONSTRAINT "ServiceNotificationIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNotificationIntent" ADD CONSTRAINT "ServiceNotificationIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNotificationIntent" ADD CONSTRAINT "ServiceNotificationIntent_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ProductShareLink_tenantId_storeId_productId_createExternalId_ke" RENAME TO "ProductShareLink_tenantId_storeId_productId_createExternalI_key";

-- RenameIndex
ALTER INDEX "ProductShareLinkEvent_tenantId_shareLinkId_type_eventExternalId" RENAME TO "ProductShareLinkEvent_tenantId_shareLinkId_type_eventExtern_key";

-- RenameIndex
ALTER INDEX "ProductShareLinkNotification_tenantId_shareLinkId_recipientType" RENAME TO "ProductShareLinkNotification_tenantId_shareLinkId_recipient_key";

-- RenameIndex
ALTER INDEX "ProductShareLinkReservation_tenantId_storeId_shareLinkId_extern" RENAME TO "ProductShareLinkReservation_tenantId_storeId_shareLinkId_ex_key";

-- RenameIndex
ALTER INDEX "ProductUnitPriceHistory_tenantId_storeId_productVariantId_exter" RENAME TO "ProductUnitPriceHistory_tenantId_storeId_productVariantId_e_key";

-- RenameIndex
ALTER INDEX "RetailOpsCustomerIdentity_tenantId_storeId_type_normalizedValue" RENAME TO "RetailOpsCustomerIdentity_tenantId_storeId_type_normalizedV_key";

-- RenameIndex
ALTER INDEX "RetailOpsStockDeclaration_cashierSessionId_type_productVariantI" RENAME TO "RetailOpsStockDeclaration_cashierSessionId_type_productVari_key";

-- RenameIndex
ALTER INDEX "StaffStockWallet_tenantId_storeId_staffUserId_productVariantId_" RENAME TO "StaffStockWallet_tenantId_storeId_staffUserId_productVarian_key";
