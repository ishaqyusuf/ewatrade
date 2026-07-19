/*
  Warnings:

  - A unique constraint covering the columns `[storeId,variantId,inventoryUnitId,custodyType,custodyReferenceId]` on the table `StockBalanceSource` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[commercialOrderLineId]` on the table `StockReservation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StockCustodyType" AS ENUM ('STORE', 'STAFF', 'SESSION', 'TRANSIT');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "InventoryCloseoutStatus" AS ENUM ('DRAFT', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductReturnDisposition" AS ENUM ('RESTOCK', 'QUARANTINE', 'DAMAGED', 'NO_RESTOCK');

-- AlterEnum
ALTER TYPE "StockOperationType" ADD VALUE 'CORRECTION';

-- DropIndex
DROP INDEX "StockBalanceSource_storeId_variantId_inventoryUnitId_key";

-- AlterTable
ALTER TABLE "StockBalanceSource" ADD COLUMN     "custodyReferenceId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "custodyType" "StockCustodyType" NOT NULL DEFAULT 'STORE',
ADD COLUMN     "parentBalanceSourceId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "reversalOfMovementId" TEXT;

-- AlterTable
ALTER TABLE "StockOperation" ADD COLUMN     "correctionOfOperationId" TEXT,
ADD COLUMN     "linkedOperationId" TEXT;

-- AlterTable
ALTER TABLE "StockReservation" ADD COLUMN     "commercialOrderLineId" TEXT;

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT,
    "finalizedOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "balanceSourceId" TEXT NOT NULL,
    "configurationVersionId" TEXT NOT NULL,
    "observedInventoryUnitId" TEXT NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "expectedQuantity" DECIMAL(38,18) NOT NULL,
    "observedQuantity" DECIMAL(38,18) NOT NULL,
    "varianceQuantity" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountEntry" (
    "id" TEXT NOT NULL,
    "stockCountLineId" TEXT NOT NULL,
    "enteredInventoryUnitId" TEXT NOT NULL,
    "enteredQuantity" DECIMAL(38,6) NOT NULL,
    "unitFactorSnapshot" DECIMAL(38,12) NOT NULL,
    "canonicalQuantity" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceStoreId" TEXT NOT NULL,
    "targetStoreId" TEXT NOT NULL,
    "sourceBalanceSourceId" TEXT NOT NULL,
    "transitBalanceSourceId" TEXT,
    "clientTransferId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "inventoryUnitId" TEXT NOT NULL,
    "configurationVersionId" TEXT NOT NULL,
    "enteredQuantity" DECIMAL(38,6) NOT NULL,
    "unitFactorSnapshot" DECIMAL(38,12) NOT NULL,
    "canonicalQuantity" DECIMAL(38,18) NOT NULL,
    "stockBehaviorSnapshot" "InventoryUnitStockBehavior" NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "dispatchedOperationId" TEXT,
    "receivedOperationId" TEXT,
    "cancelledOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCloseout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "custodyType" "StockCustodyType" NOT NULL,
    "custodyReferenceId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "InventoryCloseoutStatus" NOT NULL DEFAULT 'DRAFT',
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT,
    "finalizedOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryCloseout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCloseoutLine" (
    "id" TEXT NOT NULL,
    "closeoutId" TEXT NOT NULL,
    "balanceSourceId" TEXT NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "expectedQuantity" DECIMAL(38,18) NOT NULL,
    "declaredQuantity" DECIMAL(38,18) NOT NULL,
    "varianceQuantity" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCloseoutLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currencyCode" TEXT NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "kind" "SellableOfferingKind" NOT NULL,
    "quantity" DECIMAL(38,6) NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferingSnapshot" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "catalogItemName" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "optionSelections" JSONB NOT NULL,
    "offeringId" TEXT NOT NULL,
    "offeringName" TEXT NOT NULL,
    "offeringKind" "SellableOfferingKind" NOT NULL,
    "pricingPolicy" "OfferingPricingPolicy" NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "quantity" DECIMAL(38,6) NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "inventoryUnitId" TEXT,
    "inventoryUnitName" TEXT,
    "configurationVersionId" TEXT,
    "unitFactor" DECIMAL(38,12),
    "stockBehavior" "InventoryUnitStockBehavior",
    "balanceSourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFulfillment" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "stockOperationId" TEXT NOT NULL,
    "quantity" DECIMAL(38,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "clientReturnId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "quantity" DECIMAL(38,6) NOT NULL,
    "disposition" "ProductReturnDisposition" NOT NULL,
    "destinationBalanceSourceId" TEXT,
    "stockOperationId" TEXT,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockCount_tenantId_storeId_status_createdAt_idx" ON "StockCount"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_tenantId_clientOperationId_key" ON "StockCount"("tenantId", "clientOperationId");

-- CreateIndex
CREATE INDEX "StockCountLine_balanceSourceId_createdAt_idx" ON "StockCountLine"("balanceSourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_stockCountId_balanceSourceId_key" ON "StockCountLine"("stockCountId", "balanceSourceId");

-- CreateIndex
CREATE INDEX "StockCountEntry_stockCountLineId_idx" ON "StockCountEntry"("stockCountLineId");

-- CreateIndex
CREATE INDEX "StockCountEntry_enteredInventoryUnitId_idx" ON "StockCountEntry"("enteredInventoryUnitId");

-- CreateIndex
CREATE INDEX "StockTransfer_tenantId_sourceStoreId_status_createdAt_idx" ON "StockTransfer"("tenantId", "sourceStoreId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_tenantId_targetStoreId_status_createdAt_idx" ON "StockTransfer"("tenantId", "targetStoreId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_transitBalanceSourceId_idx" ON "StockTransfer"("transitBalanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_tenantId_clientTransferId_key" ON "StockTransfer"("tenantId", "clientTransferId");

-- CreateIndex
CREATE INDEX "InventoryCloseout_tenantId_storeId_custodyType_custodyRefer_idx" ON "InventoryCloseout"("tenantId", "storeId", "custodyType", "custodyReferenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCloseout_tenantId_clientOperationId_key" ON "InventoryCloseout"("tenantId", "clientOperationId");

-- CreateIndex
CREATE INDEX "InventoryCloseoutLine_balanceSourceId_createdAt_idx" ON "InventoryCloseoutLine"("balanceSourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCloseoutLine_closeoutId_balanceSourceId_key" ON "InventoryCloseoutLine"("closeoutId", "balanceSourceId");

-- CreateIndex
CREATE INDEX "CommercialOrder_tenantId_status_createdAt_idx" ON "CommercialOrder"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialOrder_storeId_createdAt_idx" ON "CommercialOrder"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrder_tenantId_clientOrderId_key" ON "CommercialOrder"("tenantId", "clientOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrder_storeId_orderNumber_key" ON "CommercialOrder"("storeId", "orderNumber");

-- CreateIndex
CREATE INDEX "CommercialOrderLine_orderId_idx" ON "CommercialOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "CommercialOrderLine_offeringId_idx" ON "CommercialOrderLine"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferingSnapshot_orderLineId_key" ON "OfferingSnapshot"("orderLineId");

-- CreateIndex
CREATE INDEX "OfferingSnapshot_catalogItemId_createdAt_idx" ON "OfferingSnapshot"("catalogItemId", "createdAt");

-- CreateIndex
CREATE INDEX "OfferingSnapshot_offeringId_createdAt_idx" ON "OfferingSnapshot"("offeringId", "createdAt");

-- CreateIndex
CREATE INDEX "OfferingSnapshot_balanceSourceId_idx" ON "OfferingSnapshot"("balanceSourceId");

-- CreateIndex
CREATE INDEX "ProductFulfillment_stockOperationId_idx" ON "ProductFulfillment"("stockOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFulfillment_orderLineId_reservationId_key" ON "ProductFulfillment"("orderLineId", "reservationId");

-- CreateIndex
CREATE INDEX "ProductReturn_orderLineId_createdAt_idx" ON "ProductReturn"("orderLineId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReturn_destinationBalanceSourceId_idx" ON "ProductReturn"("destinationBalanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReturn_tenantId_clientReturnId_key" ON "ProductReturn"("tenantId", "clientReturnId");

-- CreateIndex
CREATE INDEX "StockBalanceSource_parentBalanceSourceId_idx" ON "StockBalanceSource"("parentBalanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalanceSource_storeId_variantId_inventoryUnitId_custod_key" ON "StockBalanceSource"("storeId", "variantId", "inventoryUnitId", "custodyType", "custodyReferenceId");

-- CreateIndex
CREATE INDEX "StockMovement_reversalOfMovementId_idx" ON "StockMovement"("reversalOfMovementId");

-- CreateIndex
CREATE INDEX "StockOperation_linkedOperationId_idx" ON "StockOperation"("linkedOperationId");

-- CreateIndex
CREATE INDEX "StockOperation_correctionOfOperationId_idx" ON "StockOperation"("correctionOfOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_commercialOrderLineId_key" ON "StockReservation"("commercialOrderLineId");

-- AddForeignKey
ALTER TABLE "StockBalanceSource" ADD CONSTRAINT "StockBalanceSource_parentBalanceSourceId_fkey" FOREIGN KEY ("parentBalanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_commercialOrderLineId_fkey" FOREIGN KEY ("commercialOrderLineId") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_linkedOperationId_fkey" FOREIGN KEY ("linkedOperationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_correctionOfOperationId_fkey" FOREIGN KEY ("correctionOfOperationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversalOfMovementId_fkey" FOREIGN KEY ("reversalOfMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_finalizedOperationId_fkey" FOREIGN KEY ("finalizedOperationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_balanceSourceId_fkey" FOREIGN KEY ("balanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "UnitConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_observedInventoryUnitId_fkey" FOREIGN KEY ("observedInventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountEntry" ADD CONSTRAINT "StockCountEntry_stockCountLineId_fkey" FOREIGN KEY ("stockCountLineId") REFERENCES "StockCountLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountEntry" ADD CONSTRAINT "StockCountEntry_enteredInventoryUnitId_fkey" FOREIGN KEY ("enteredInventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceStoreId_fkey" FOREIGN KEY ("sourceStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_targetStoreId_fkey" FOREIGN KEY ("targetStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceBalanceSourceId_fkey" FOREIGN KEY ("sourceBalanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_transitBalanceSourceId_fkey" FOREIGN KEY ("transitBalanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "UnitConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_dispatchedOperationId_fkey" FOREIGN KEY ("dispatchedOperationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedOperationId_fkey" FOREIGN KEY ("receivedOperationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_cancelledOperationId_fkey" FOREIGN KEY ("cancelledOperationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCloseout" ADD CONSTRAINT "InventoryCloseout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCloseout" ADD CONSTRAINT "InventoryCloseout_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCloseout" ADD CONSTRAINT "InventoryCloseout_finalizedOperationId_fkey" FOREIGN KEY ("finalizedOperationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCloseoutLine" ADD CONSTRAINT "InventoryCloseoutLine_closeoutId_fkey" FOREIGN KEY ("closeoutId") REFERENCES "InventoryCloseout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCloseoutLine" ADD CONSTRAINT "InventoryCloseoutLine_balanceSourceId_fkey" FOREIGN KEY ("balanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrder" ADD CONSTRAINT "CommercialOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrder" ADD CONSTRAINT "CommercialOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderLine" ADD CONSTRAINT "CommercialOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderLine" ADD CONSTRAINT "CommercialOrderLine_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingSnapshot" ADD CONSTRAINT "OfferingSnapshot_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "CommercialOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingSnapshot" ADD CONSTRAINT "OfferingSnapshot_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingSnapshot" ADD CONSTRAINT "OfferingSnapshot_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "UnitConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingSnapshot" ADD CONSTRAINT "OfferingSnapshot_balanceSourceId_fkey" FOREIGN KEY ("balanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFulfillment" ADD CONSTRAINT "ProductFulfillment_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFulfillment" ADD CONSTRAINT "ProductFulfillment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StockReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFulfillment" ADD CONSTRAINT "ProductFulfillment_stockOperationId_fkey" FOREIGN KEY ("stockOperationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_destinationBalanceSourceId_fkey" FOREIGN KEY ("destinationBalanceSourceId") REFERENCES "StockBalanceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_stockOperationId_fkey" FOREIGN KEY ("stockOperationId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
