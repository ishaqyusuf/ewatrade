-- CreateEnum
CREATE TYPE "ProductShareLinkStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductShareLinkEventType" AS ENUM ('CREATED', 'VIEWED', 'ORDER_REQUESTED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ProductShareLinkOrderRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProductShareLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "status" "ProductShareLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createExternalId" TEXT,
    "deactivatedByUserId" TEXT,
    "deactivateExternalId" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductShareLinkEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "type" "ProductShareLinkEventType" NOT NULL,
    "actorUserId" TEXT,
    "customerAccountId" TEXT,
    "eventExternalId" TEXT,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductShareLinkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductShareLinkView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "visitorKey" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductShareLinkView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductShareLinkOrderRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "customerAuthMode" TEXT,
    "status" "ProductShareLinkOrderRequestStatus" NOT NULL DEFAULT 'PENDING',
    "quantity" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "followedUpByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductShareLinkOrderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductShareLink_tenantId_token_key" ON "ProductShareLink"("tenantId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ProductShareLink_tenantId_storeId_productId_createExternalId_key" ON "ProductShareLink"("tenantId", "storeId", "productId", "createExternalId");

-- CreateIndex
CREATE INDEX "ProductShareLink_tenantId_storeId_status_idx" ON "ProductShareLink"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "ProductShareLink_productId_status_idx" ON "ProductShareLink"("productId", "status");

-- CreateIndex
CREATE INDEX "ProductShareLink_createdByUserId_createdAt_idx" ON "ProductShareLink"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductShareLink_lastActivityAt_idx" ON "ProductShareLink"("lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductShareLinkEvent_tenantId_shareLinkId_type_eventExternalId_key" ON "ProductShareLinkEvent"("tenantId", "shareLinkId", "type", "eventExternalId");

-- CreateIndex
CREATE INDEX "ProductShareLinkEvent_tenantId_happenedAt_idx" ON "ProductShareLinkEvent"("tenantId", "happenedAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkEvent_shareLinkId_happenedAt_idx" ON "ProductShareLinkEvent"("shareLinkId", "happenedAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkEvent_type_happenedAt_idx" ON "ProductShareLinkEvent"("type", "happenedAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkView_tenantId_viewedAt_idx" ON "ProductShareLinkView"("tenantId", "viewedAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkView_shareLinkId_viewedAt_idx" ON "ProductShareLinkView"("shareLinkId", "viewedAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkView_productId_viewedAt_idx" ON "ProductShareLinkView"("productId", "viewedAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkView_visitorKey_idx" ON "ProductShareLinkView"("visitorKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductShareLinkOrderRequest_orderId_key" ON "ProductShareLinkOrderRequest"("orderId");

-- CreateIndex
CREATE INDEX "ProductShareLinkOrderRequest_tenantId_storeId_status_idx" ON "ProductShareLinkOrderRequest"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "ProductShareLinkOrderRequest_shareLinkId_requestedAt_idx" ON "ProductShareLinkOrderRequest"("shareLinkId", "requestedAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkOrderRequest_customerAccountId_requestedAt_idx" ON "ProductShareLinkOrderRequest"("customerAccountId", "requestedAt");

-- CreateIndex
CREATE INDEX "ProductShareLinkOrderRequest_followedUpByUserId_updatedAt_idx" ON "ProductShareLinkOrderRequest"("followedUpByUserId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ProductShareLink" ADD CONSTRAINT "ProductShareLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLink" ADD CONSTRAINT "ProductShareLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLink" ADD CONSTRAINT "ProductShareLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkEvent" ADD CONSTRAINT "ProductShareLinkEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkEvent" ADD CONSTRAINT "ProductShareLinkEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkEvent" ADD CONSTRAINT "ProductShareLinkEvent_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ProductShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkView" ADD CONSTRAINT "ProductShareLinkView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkView" ADD CONSTRAINT "ProductShareLinkView_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkView" ADD CONSTRAINT "ProductShareLinkView_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ProductShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkView" ADD CONSTRAINT "ProductShareLinkView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" ADD CONSTRAINT "ProductShareLinkOrderRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" ADD CONSTRAINT "ProductShareLinkOrderRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" ADD CONSTRAINT "ProductShareLinkOrderRequest_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ProductShareLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" ADD CONSTRAINT "ProductShareLinkOrderRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" ADD CONSTRAINT "ProductShareLinkOrderRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
