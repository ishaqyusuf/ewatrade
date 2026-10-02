/*
  Warnings:

  - A unique constraint covering the columns `[bookId,billId,id]` on the table `FinanceBillLine` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FinancePurchaseRecognitionStage" AS ENUM ('INVOICE', 'OWNERSHIP', 'RECEIPT');

-- AlterEnum
ALTER TYPE "FinanceBillKind" ADD VALUE 'PURCHASE_ACCRUAL';

-- CreateTable
CREATE TABLE "FinancePurchaseRecognition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "costBillId" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePurchaseRecognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePurchaseRecognitionLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "recognitionId" TEXT NOT NULL,
    "costBillId" TEXT NOT NULL,
    "costBillLineId" TEXT NOT NULL,
    "balanceSourceId" TEXT NOT NULL,
    "enteredInventoryUnitId" TEXT NOT NULL,
    "configurationVersionId" TEXT NOT NULL,
    "enteredQuantity" DECIMAL(38,18) NOT NULL,
    "categories" JSONB NOT NULL,

    CONSTRAINT "FinancePurchaseRecognitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePurchaseRecognitionEvent" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "recognitionId" TEXT NOT NULL,
    "stage" "FinancePurchaseRecognitionStage" NOT NULL,
    "originalStage" "FinancePurchaseRecognitionStage",
    "journalEntryId" TEXT NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "invoiceBillId" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePurchaseRecognitionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognition_costBillId_key" ON "FinancePurchaseRecognition"("costBillId");

-- CreateIndex
CREATE INDEX "FinancePurchaseRecognition_bookId_supplierId_agreedAt_idx" ON "FinancePurchaseRecognition"("bookId", "supplierId", "agreedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognition_bookId_id_key" ON "FinancePurchaseRecognition"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognition_bookId_supplierId_id_key" ON "FinancePurchaseRecognition"("bookId", "supplierId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognition_bookId_costBillId_id_key" ON "FinancePurchaseRecognition"("bookId", "costBillId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognition_bookId_supplierId_costBillId_key" ON "FinancePurchaseRecognition"("bookId", "supplierId", "costBillId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionLine_costBillLineId_key" ON "FinancePurchaseRecognitionLine"("costBillLineId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionLine_recognitionId_balanceSourceI_key" ON "FinancePurchaseRecognitionLine"("recognitionId", "balanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionLine_bookId_costBillId_costBillLi_key" ON "FinancePurchaseRecognitionLine"("bookId", "costBillId", "costBillLineId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionEvent_journalEntryId_key" ON "FinancePurchaseRecognitionEvent"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionEvent_invoiceBillId_key" ON "FinancePurchaseRecognitionEvent"("invoiceBillId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionEvent_reversalOfId_key" ON "FinancePurchaseRecognitionEvent"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinancePurchaseRecognitionEvent_bookId_recognitionId_effect_idx" ON "FinancePurchaseRecognitionEvent"("bookId", "recognitionId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionEvent_recognitionId_originalStage_key" ON "FinancePurchaseRecognitionEvent"("recognitionId", "originalStage");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionEvent_bookId_recognitionId_id_key" ON "FinancePurchaseRecognitionEvent"("bookId", "recognitionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionEvent_bookId_journalEntryId_key" ON "FinancePurchaseRecognitionEvent"("bookId", "journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionEvent_bookId_supplierId_invoiceBi_key" ON "FinancePurchaseRecognitionEvent"("bookId", "supplierId", "invoiceBillId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseRecognitionEvent_bookId_recognitionId_revers_key" ON "FinancePurchaseRecognitionEvent"("bookId", "recognitionId", "reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillLine_bookId_billId_id_key" ON "FinanceBillLine"("bookId", "billId", "id");

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognition" ADD CONSTRAINT "FinancePurchaseRecognition_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognition" ADD CONSTRAINT "FinancePurchaseRecognition_bookId_supplierId_fkey" FOREIGN KEY ("bookId", "supplierId") REFERENCES "FinanceSupplierAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognition" ADD CONSTRAINT "FinancePurchaseRecognition_bookId_supplierId_costBillId_fkey" FOREIGN KEY ("bookId", "supplierId", "costBillId") REFERENCES "FinanceBill"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionLine" ADD CONSTRAINT "FinancePurchaseRecognitionLine_bookId_costBillId_recogniti_fkey" FOREIGN KEY ("bookId", "costBillId", "recognitionId") REFERENCES "FinancePurchaseRecognition"("bookId", "costBillId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionLine" ADD CONSTRAINT "FinancePurchaseRecognitionLine_bookId_costBillId_costBillL_fkey" FOREIGN KEY ("bookId", "costBillId", "costBillLineId") REFERENCES "FinanceBillLine"("bookId", "billId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionLine" ADD CONSTRAINT "FinancePurchaseRecognitionLine_tenantId_balanceSourceId_fkey" FOREIGN KEY ("tenantId", "balanceSourceId") REFERENCES "StockBalanceSource"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionLine" ADD CONSTRAINT "FinancePurchaseRecognitionLine_enteredInventoryUnitId_fkey" FOREIGN KEY ("enteredInventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionLine" ADD CONSTRAINT "FinancePurchaseRecognitionLine_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "UnitConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionEvent" ADD CONSTRAINT "FinancePurchaseRecognitionEvent_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionEvent" ADD CONSTRAINT "FinancePurchaseRecognitionEvent_bookId_supplierId_recognit_fkey" FOREIGN KEY ("bookId", "supplierId", "recognitionId") REFERENCES "FinancePurchaseRecognition"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionEvent" ADD CONSTRAINT "FinancePurchaseRecognitionEvent_bookId_journalEntryId_fkey" FOREIGN KEY ("bookId", "journalEntryId") REFERENCES "FinanceJournalEntry"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionEvent" ADD CONSTRAINT "FinancePurchaseRecognitionEvent_bookId_debitAccountId_fkey" FOREIGN KEY ("bookId", "debitAccountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionEvent" ADD CONSTRAINT "FinancePurchaseRecognitionEvent_bookId_creditAccountId_fkey" FOREIGN KEY ("bookId", "creditAccountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionEvent" ADD CONSTRAINT "FinancePurchaseRecognitionEvent_bookId_supplierId_invoiceB_fkey" FOREIGN KEY ("bookId", "supplierId", "invoiceBillId") REFERENCES "FinanceBill"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePurchaseRecognitionEvent" ADD CONSTRAINT "FinancePurchaseRecognitionEvent_bookId_recognitionId_rever_fkey" FOREIGN KEY ("bookId", "recognitionId", "reversalOfId") REFERENCES "FinancePurchaseRecognitionEvent"("bookId", "recognitionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
