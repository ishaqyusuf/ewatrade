-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'COMMITTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "balanceSourceId" TEXT NOT NULL,
    "configurationVersionId" TEXT NOT NULL,
    "enteredInventoryUnitId" TEXT NOT NULL,
    "clientReservationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "enteredQuantity" DECIMAL(38,6) NOT NULL,
    "unitFactorSnapshot" DECIMAL(38,12) NOT NULL,
    "canonicalQuantity" DECIMAL(38,18) NOT NULL,
    "balanceRevisionSnapshot" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockReservation_balanceSourceId_status_expiresAt_idx" ON "StockReservation"("balanceSourceId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StockReservation_offeringId_status_idx" ON "StockReservation"("offeringId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_tenantId_storeId_createdAt_idx" ON "StockReservation"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_tenantId_clientReservationId_key" ON "StockReservation"("tenantId", "clientReservationId");

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_balanceSourceId_fkey" FOREIGN KEY ("balanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "UnitConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_enteredInventoryUnitId_fkey" FOREIGN KEY ("enteredInventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
