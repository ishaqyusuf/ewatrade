-- CreateEnum
CREATE TYPE "StockBalanceKind" AS ENUM ('SHARED_POOL', 'PACKAGED_STOCK');

-- CreateEnum
CREATE TYPE "StockOperationType" AS ENUM ('OPENING_STOCK', 'RECEIPT', 'RESERVATION_COMMIT', 'SALE_FULFILLMENT', 'RETURN', 'COUNT_RECONCILIATION', 'ADJUSTMENT', 'TRANSFER', 'TRANSFORMATION', 'STOCK_TRANSITION', 'CUSTODY_ASSIGNMENT', 'CUSTODY_RETURN', 'CORRECTION_REVERSAL', 'CORRECTION_REPLACEMENT');

-- CreateTable
CREATE TABLE "CatalogCommandReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogCommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalanceSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "inventoryUnitId" TEXT NOT NULL,
    "kind" "StockBalanceKind" NOT NULL,
    "onHandQuantity" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "reservedQuantity" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalanceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "StockOperationType" NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "balanceSourceId" TEXT NOT NULL,
    "configurationVersionId" TEXT NOT NULL,
    "enteredInventoryUnitId" TEXT NOT NULL,
    "enteredQuantity" DECIMAL(38,6) NOT NULL,
    "transactionScaleSnapshot" INTEGER NOT NULL,
    "unitFactorSnapshot" DECIMAL(38,12) NOT NULL,
    "signedCanonicalEffect" DECIMAL(38,18) NOT NULL,
    "previousOnHandQuantity" DECIMAL(38,18) NOT NULL,
    "resultingOnHandQuantity" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogCommandReceipt_storeId_createdAt_idx" ON "CatalogCommandReceipt"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogCommandReceipt_catalogItemId_idx" ON "CatalogCommandReceipt"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCommandReceipt_tenantId_clientOperationId_key" ON "CatalogCommandReceipt"("tenantId", "clientOperationId");

-- CreateIndex
CREATE INDEX "StockBalanceSource_tenantId_storeId_kind_idx" ON "StockBalanceSource"("tenantId", "storeId", "kind");

-- CreateIndex
CREATE INDEX "StockBalanceSource_productId_variantId_idx" ON "StockBalanceSource"("productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalanceSource_storeId_variantId_inventoryUnitId_key" ON "StockBalanceSource"("storeId", "variantId", "inventoryUnitId");

-- CreateIndex
CREATE INDEX "StockOperation_tenantId_storeId_effectiveAt_idx" ON "StockOperation"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "StockOperation_type_effectiveAt_idx" ON "StockOperation"("type", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockOperation_tenantId_clientOperationId_key" ON "StockOperation"("tenantId", "clientOperationId");

-- CreateIndex
CREATE INDEX "StockMovement_operationId_idx" ON "StockMovement"("operationId");

-- CreateIndex
CREATE INDEX "StockMovement_balanceSourceId_createdAt_idx" ON "StockMovement"("balanceSourceId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_configurationVersionId_idx" ON "StockMovement"("configurationVersionId");

-- AddForeignKey
ALTER TABLE "CatalogCommandReceipt" ADD CONSTRAINT "CatalogCommandReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogCommandReceipt" ADD CONSTRAINT "CatalogCommandReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogCommandReceipt" ADD CONSTRAINT "CatalogCommandReceipt_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalanceSource" ADD CONSTRAINT "StockBalanceSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalanceSource" ADD CONSTRAINT "StockBalanceSource_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalanceSource" ADD CONSTRAINT "StockBalanceSource_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalanceSource" ADD CONSTRAINT "StockBalanceSource_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "SellableVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalanceSource" ADD CONSTRAINT "StockBalanceSource_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_balanceSourceId_fkey" FOREIGN KEY ("balanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "UnitConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_enteredInventoryUnitId_fkey" FOREIGN KEY ("enteredInventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
