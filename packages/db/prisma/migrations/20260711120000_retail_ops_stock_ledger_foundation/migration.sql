-- CreateEnum
CREATE TYPE "StockDeliveryStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockDeliverySource" AS ENUM ('PRODUCTION', 'SUPPLIER', 'MANUAL', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryMovementDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_STOCK', 'STOCK_INTAKE', 'STOCK_ADJUSTMENT', 'CONVERSION_OUT', 'CONVERSION_IN', 'SALE_DEDUCTION', 'STAFF_ASSIGNMENT', 'STAFF_RETURN', 'CLOSEOUT_ADJUSTMENT', 'DAMAGE', 'LOSS', 'SYNC_CORRECTION');

-- CreateEnum
CREATE TYPE "InventoryMovementSource" AS ENUM ('PRODUCT_SETUP', 'STOCK_DELIVERY', 'STOCK_ADJUSTMENT', 'UNIT_CONVERSION', 'SALE', 'STAFF_STOCK_ASSIGNMENT', 'STAFF_STOCK_RETURN', 'CLOSEOUT', 'SYNC_REPLAY', 'MANUAL');

-- CreateTable
CREATE TABLE "StockDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "source" "StockDeliverySource" NOT NULL DEFAULT 'MANUAL',
    "sourceName" TEXT,
    "status" "StockDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedByUserId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDeliveryLine" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitNameSnapshot" TEXT NOT NULL,
    "unitSkuSnapshot" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockDeliveryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "relatedProductVariantId" TEXT,
    "inventoryItemId" TEXT,
    "stockDeliveryId" TEXT,
    "stockDeliveryLineId" TEXT,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "cashierSessionId" TEXT,
    "actorUserId" TEXT,
    "staffUserId" TEXT,
    "type" "InventoryMovementType" NOT NULL,
    "direction" "InventoryMovementDirection" NOT NULL,
    "source" "InventoryMovementSource" NOT NULL DEFAULT 'MANUAL',
    "quantity" INTEGER NOT NULL,
    "previousOnHandQuantity" INTEGER,
    "onHandQuantity" INTEGER,
    "sourceReferenceId" TEXT,
    "externalId" TEXT,
    "movementGroupId" TEXT,
    "note" TEXT,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockDelivery_storeId_referenceNumber_key" ON "StockDelivery"("storeId", "referenceNumber");

-- CreateIndex
CREATE INDEX "StockDelivery_tenantId_storeId_receivedAt_idx" ON "StockDelivery"("tenantId", "storeId", "receivedAt");

-- CreateIndex
CREATE INDEX "StockDelivery_storeId_status_idx" ON "StockDelivery"("storeId", "status");

-- CreateIndex
CREATE INDEX "StockDeliveryLine_tenantId_storeId_idx" ON "StockDeliveryLine"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "StockDeliveryLine_productVariantId_createdAt_idx" ON "StockDeliveryLine"("productVariantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_tenantId_storeId_type_externalId_key" ON "InventoryMovement"("tenantId", "storeId", "type", "externalId");

-- CreateIndex
CREATE INDEX "InventoryMovement_tenantId_storeId_happenedAt_idx" ON "InventoryMovement"("tenantId", "storeId", "happenedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_productVariantId_happenedAt_idx" ON "InventoryMovement"("productVariantId", "happenedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_type_happenedAt_idx" ON "InventoryMovement"("type", "happenedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_movementGroupId_idx" ON "InventoryMovement"("movementGroupId");

-- AddForeignKey
ALTER TABLE "StockDelivery" ADD CONSTRAINT "StockDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDeliveryLine" ADD CONSTRAINT "StockDeliveryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "StockDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDeliveryLine" ADD CONSTRAINT "StockDeliveryLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDeliveryLine" ADD CONSTRAINT "StockDeliveryLine_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_relatedProductVariantId_fkey" FOREIGN KEY ("relatedProductVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_stockDeliveryId_fkey" FOREIGN KEY ("stockDeliveryId") REFERENCES "StockDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_stockDeliveryLineId_fkey" FOREIGN KEY ("stockDeliveryLineId") REFERENCES "StockDeliveryLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_cashierSessionId_fkey" FOREIGN KEY ("cashierSessionId") REFERENCES "CashierSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
