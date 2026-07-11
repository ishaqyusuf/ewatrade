-- CreateEnum
CREATE TYPE "ProductShareLinkReservationStatus" AS ENUM ('RESERVED', 'RELEASED', 'CONSUMED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductShareLinkNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ProductShareLinkNotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "ProductShareLinkNotificationRecipientType" AS ENUM ('CUSTOMER', 'OWNER', 'ADMIN', 'SALES_REP', 'LINK_CREATOR', 'OTHER');

-- CreateTable
CREATE TABLE "ProductShareLinkReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "orderRequestId" TEXT,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "status" "ProductShareLinkReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "quantity" INTEGER NOT NULL,
    "reservedByUserId" TEXT,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductShareLinkReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductShareLinkNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "orderRequestId" TEXT,
    "channel" "ProductShareLinkNotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "recipientType" "ProductShareLinkNotificationRecipientType" NOT NULL,
    "recipientUserId" TEXT,
    "recipientEmail" TEXT,
    "status" "ProductShareLinkNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "subject" TEXT,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductShareLinkNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductShareLinkAnalyticsDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitorCount" INTEGER NOT NULL DEFAULT 0,
    "orderRequestCount" INTEGER NOT NULL DEFAULT 0,
    "completedOrderCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledOrderCount" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "releasedQuantity" INTEGER NOT NULL DEFAULT 0,
    "consumedQuantity" INTEGER NOT NULL DEFAULT 0,
    "revenueMinor" INTEGER NOT NULL DEFAULT 0,
    "lastRolledUpAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductShareLinkAnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductShareLinkReservation_tenantId_storeId_shareLinkId_externalId_key" ON "ProductShareLinkReservation"("tenantId", "storeId", "shareLinkId", "externalId");

-- CreateIndex
CREATE INDEX "ProductShareLinkReservation_tenantId_storeId_status_idx" ON "ProductShareLinkReservation"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "ProductShareLinkReservation_shareLinkId_reservedAt_idx" ON "ProductShareLinkReservation"("shareLinkId", "reservedAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkReservation_orderRequestId_idx" ON "ProductShareLinkReservation"("orderRequestId");

-- CreateIndex
CREATE INDEX "ProductShareLinkReservation_productVariantId_status_idx" ON "ProductShareLinkReservation"("productVariantId", "status");

-- CreateIndex
CREATE INDEX "ProductShareLinkReservation_orderId_idx" ON "ProductShareLinkReservation"("orderId");

-- CreateIndex
CREATE INDEX "ProductShareLinkReservation_expiresAt_idx" ON "ProductShareLinkReservation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductShareLinkNotification_tenantId_shareLinkId_recipientType_channel_externalId_key" ON "ProductShareLinkNotification"("tenantId", "shareLinkId", "recipientType", "channel", "externalId");

-- CreateIndex
CREATE INDEX "ProductShareLinkNotification_tenantId_storeId_status_idx" ON "ProductShareLinkNotification"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "ProductShareLinkNotification_shareLinkId_createdAt_idx" ON "ProductShareLinkNotification"("shareLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkNotification_orderRequestId_createdAt_idx" ON "ProductShareLinkNotification"("orderRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkNotification_recipientUserId_createdAt_idx" ON "ProductShareLinkNotification"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkNotification_recipientEmail_createdAt_idx" ON "ProductShareLinkNotification"("recipientEmail", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductShareLinkAnalyticsDaily_shareLinkId_day_key" ON "ProductShareLinkAnalyticsDaily"("shareLinkId", "day");

-- CreateIndex
CREATE INDEX "ProductShareLinkAnalyticsDaily_tenantId_storeId_day_idx" ON "ProductShareLinkAnalyticsDaily"("tenantId", "storeId", "day");

-- CreateIndex
CREATE INDEX "ProductShareLinkAnalyticsDaily_productId_day_idx" ON "ProductShareLinkAnalyticsDaily"("productId", "day");

-- CreateIndex
CREATE INDEX "ProductShareLinkAnalyticsDaily_lastRolledUpAt_idx" ON "ProductShareLinkAnalyticsDaily"("lastRolledUpAt");

-- AddForeignKey
ALTER TABLE "ProductShareLinkReservation" ADD CONSTRAINT "ProductShareLinkReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkReservation" ADD CONSTRAINT "ProductShareLinkReservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkReservation" ADD CONSTRAINT "ProductShareLinkReservation_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ProductShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkReservation" ADD CONSTRAINT "ProductShareLinkReservation_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES "ProductShareLinkOrderRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkReservation" ADD CONSTRAINT "ProductShareLinkReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkReservation" ADD CONSTRAINT "ProductShareLinkReservation_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkReservation" ADD CONSTRAINT "ProductShareLinkReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkReservation" ADD CONSTRAINT "ProductShareLinkReservation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkNotification" ADD CONSTRAINT "ProductShareLinkNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkNotification" ADD CONSTRAINT "ProductShareLinkNotification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkNotification" ADD CONSTRAINT "ProductShareLinkNotification_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ProductShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkNotification" ADD CONSTRAINT "ProductShareLinkNotification_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES "ProductShareLinkOrderRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkAnalyticsDaily" ADD CONSTRAINT "ProductShareLinkAnalyticsDaily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkAnalyticsDaily" ADD CONSTRAINT "ProductShareLinkAnalyticsDaily_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkAnalyticsDaily" ADD CONSTRAINT "ProductShareLinkAnalyticsDaily_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ProductShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkAnalyticsDaily" ADD CONSTRAINT "ProductShareLinkAnalyticsDaily_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
