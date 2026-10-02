/*
  Warnings:

  - A unique constraint covering the columns `[bookId,supplierId,id]` on the table `FinanceBill` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[bookId,id]` on the table `FinanceBillLine` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[bookId,billId,id]` on the table `FinanceBillPayment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,id]` on the table `FinanceBook` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[paymentId]` on the table `FinanceSupplierEntry` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[bookId,billId,paymentId]` on the table `FinanceSupplierEntry` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[operationId,id]` on the table `StockMovement` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FinanceSupplierEntryKind" ADD VALUE 'PURCHASE_BILL';
ALTER TYPE "FinanceSupplierEntryKind" ADD VALUE 'PURCHASE_PAYMENT';
ALTER TYPE "FinanceSupplierEntryKind" ADD VALUE 'ADVANCE_ALLOCATION';
ALTER TYPE "FinanceSupplierEntryKind" ADD VALUE 'ALLOCATION_RELEASE';

-- AlterTable
ALTER TABLE "FinanceBill" ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "FinanceSupplierEntry" ADD COLUMN     "billId" TEXT,
ADD COLUMN     "paymentId" TEXT;

-- CreateTable
CREATE TABLE "FinancePurchaseReceiptLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "billLineId" TEXT NOT NULL,
    "stockOperationId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePurchaseReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSupplierAllocation" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "advanceEntryId" TEXT NOT NULL,
    "supplierEntryId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSupplierAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSupplierAllocationRelease" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "supplierEntryId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSupplierAllocationRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseReceiptLine_billLineId_key" ON "FinancePurchaseReceiptLine"("billLineId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseReceiptLine_stockMovementId_key" ON "FinancePurchaseReceiptLine"("stockMovementId");

-- CreateIndex
CREATE INDEX "FinancePurchaseReceiptLine_bookId_stockOperationId_idx" ON "FinancePurchaseReceiptLine"("bookId", "stockOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseReceiptLine_bookId_billLineId_key" ON "FinancePurchaseReceiptLine"("bookId", "billLineId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseReceiptLine_stockOperationId_stockMovementId_key" ON "FinancePurchaseReceiptLine"("stockOperationId", "stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierAllocation_supplierEntryId_key" ON "FinanceSupplierAllocation"("supplierEntryId");

-- CreateIndex
CREATE INDEX "FinanceSupplierAllocation_bookId_billId_idx" ON "FinanceSupplierAllocation"("bookId", "billId");

-- CreateIndex
CREATE INDEX "FinanceSupplierAllocation_bookId_advanceEntryId_idx" ON "FinanceSupplierAllocation"("bookId", "advanceEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierAllocation_bookId_supplierId_id_key" ON "FinanceSupplierAllocation"("bookId", "supplierId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierAllocation_bookId_supplierId_supplierEntryId_key" ON "FinanceSupplierAllocation"("bookId", "supplierId", "supplierEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierAllocationRelease_supplierEntryId_key" ON "FinanceSupplierAllocationRelease"("supplierEntryId");

-- CreateIndex
CREATE INDEX "FinanceSupplierAllocationRelease_bookId_allocationId_idx" ON "FinanceSupplierAllocationRelease"("bookId", "allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierAllocationRelease_bookId_supplierId_supplier_key" ON "FinanceSupplierAllocationRelease"("bookId", "supplierId", "supplierEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBill_bookId_supplierId_id_key" ON "FinanceBill"("bookId", "supplierId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillLine_bookId_id_key" ON "FinanceBillLine"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillPayment_bookId_billId_id_key" ON "FinanceBillPayment"("bookId", "billId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBook_tenantId_id_key" ON "FinanceBook"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierEntry_paymentId_key" ON "FinanceSupplierEntry"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierEntry_bookId_billId_paymentId_key" ON "FinanceSupplierEntry"("bookId", "billId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_operationId_id_key" ON "StockMovement"("operationId", "id");

-- AddForeignKey
ALTER TABLE "FinanceBill" ADD CONSTRAINT "FinanceBill_bookId_supplierId_fkey" FOREIGN KEY ("bookId", "supplierId") REFERENCES "FinanceSupplierAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseReceiptLine" ADD CONSTRAINT "FinancePurchaseReceiptLine_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseReceiptLine" ADD CONSTRAINT "FinancePurchaseReceiptLine_bookId_billLineId_fkey" FOREIGN KEY ("bookId", "billLineId") REFERENCES "FinanceBillLine"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseReceiptLine" ADD CONSTRAINT "FinancePurchaseReceiptLine_tenantId_stockOperationId_fkey" FOREIGN KEY ("tenantId", "stockOperationId") REFERENCES "StockOperation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseReceiptLine" ADD CONSTRAINT "FinancePurchaseReceiptLine_stockOperationId_stockMovementI_fkey" FOREIGN KEY ("stockOperationId", "stockMovementId") REFERENCES "StockMovement"("operationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierEntry" ADD CONSTRAINT "FinanceSupplierEntry_bookId_supplierId_billId_fkey" FOREIGN KEY ("bookId", "supplierId", "billId") REFERENCES "FinanceBill"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierEntry" ADD CONSTRAINT "FinanceSupplierEntry_bookId_billId_paymentId_fkey" FOREIGN KEY ("bookId", "billId", "paymentId") REFERENCES "FinanceBillPayment"("bookId", "billId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierAllocation" ADD CONSTRAINT "FinanceSupplierAllocation_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierAllocation" ADD CONSTRAINT "FinanceSupplierAllocation_bookId_supplierId_fkey" FOREIGN KEY ("bookId", "supplierId") REFERENCES "FinanceSupplierAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierAllocation" ADD CONSTRAINT "FinanceSupplierAllocation_bookId_supplierId_billId_fkey" FOREIGN KEY ("bookId", "supplierId", "billId") REFERENCES "FinanceBill"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierAllocation" ADD CONSTRAINT "FinanceSupplierAllocation_bookId_supplierId_advanceEntryId_fkey" FOREIGN KEY ("bookId", "supplierId", "advanceEntryId") REFERENCES "FinanceSupplierEntry"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierAllocation" ADD CONSTRAINT "FinanceSupplierAllocation_bookId_supplierId_supplierEntryI_fkey" FOREIGN KEY ("bookId", "supplierId", "supplierEntryId") REFERENCES "FinanceSupplierEntry"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierAllocationRelease" ADD CONSTRAINT "FinanceSupplierAllocationRelease_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierAllocationRelease" ADD CONSTRAINT "FinanceSupplierAllocationRelease_bookId_supplierId_fkey" FOREIGN KEY ("bookId", "supplierId") REFERENCES "FinanceSupplierAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierAllocationRelease" ADD CONSTRAINT "FinanceSupplierAllocationRelease_bookId_supplierId_allocat_fkey" FOREIGN KEY ("bookId", "supplierId", "allocationId") REFERENCES "FinanceSupplierAllocation"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierAllocationRelease" ADD CONSTRAINT "FinanceSupplierAllocationRelease_bookId_supplierId_supplie_fkey" FOREIGN KEY ("bookId", "supplierId", "supplierEntryId") REFERENCES "FinanceSupplierEntry"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
