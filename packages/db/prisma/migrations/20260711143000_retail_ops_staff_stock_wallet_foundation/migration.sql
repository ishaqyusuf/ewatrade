-- CreateTable
CREATE TABLE "StaffStockWallet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "onHandQuantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "lastMovementAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffStockWallet_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "staffStockWalletId" TEXT,
ADD COLUMN "previousStaffWalletQuantity" INTEGER,
ADD COLUMN "staffWalletQuantity" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "StaffStockWallet_tenantId_storeId_staffUserId_productVariantId_key" ON "StaffStockWallet"("tenantId", "storeId", "staffUserId", "productVariantId");

-- CreateIndex
CREATE INDEX "StaffStockWallet_tenantId_storeId_staffUserId_idx" ON "StaffStockWallet"("tenantId", "storeId", "staffUserId");

-- CreateIndex
CREATE INDEX "StaffStockWallet_productVariantId_updatedAt_idx" ON "StaffStockWallet"("productVariantId", "updatedAt");

-- CreateIndex
CREATE INDEX "StaffStockWallet_lastMovementAt_idx" ON "StaffStockWallet"("lastMovementAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_staffStockWalletId_happenedAt_idx" ON "InventoryMovement"("staffStockWalletId", "happenedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_staffUserId_happenedAt_idx" ON "InventoryMovement"("staffUserId", "happenedAt");

-- AddForeignKey
ALTER TABLE "StaffStockWallet" ADD CONSTRAINT "StaffStockWallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffStockWallet" ADD CONSTRAINT "StaffStockWallet_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffStockWallet" ADD CONSTRAINT "StaffStockWallet_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffStockWallet" ADD CONSTRAINT "StaffStockWallet_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffStockWallet" ADD CONSTRAINT "StaffStockWallet_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_staffStockWalletId_fkey" FOREIGN KEY ("staffStockWalletId") REFERENCES "StaffStockWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
