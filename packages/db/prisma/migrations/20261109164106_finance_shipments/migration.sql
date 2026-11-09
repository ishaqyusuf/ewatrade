-- CreateEnum
CREATE TYPE "FinanceShipmentStatus" AS ENUM ('DRAFT', 'EXPECTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED_SHORT', 'CANCELLED');

-- CreateTable
CREATE TABLE "FinanceShipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "expectedAt" TIMESTAMP(3),
    "status" "FinanceShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "freightAmount" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "freightCurrencyCode" TEXT NOT NULL,
    "freightMinor" BIGINT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceShipmentRate" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "rate" DECIMAL(38,18) NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "FinanceShipmentRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceShipmentLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "proposedName" TEXT,
    "balanceSourceId" TEXT,
    "enteredInventoryUnitId" TEXT,
    "expectedQuantity" DECIMAL(38,18) NOT NULL,
    "sourceCurrencyCode" TEXT NOT NULL,
    "sourceUnitPrice" DECIMAL(38,18) NOT NULL,
    "freightOverrideMinor" BIGINT,
    "goodsMinor" BIGINT,
    "freightMinor" BIGINT,
    "adjustmentMinor" BIGINT NOT NULL DEFAULT 0,
    "receivedQuantity" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "receivedCostMinor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "FinanceShipmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceShipmentCostAdjustment" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceShipmentCostAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceShipmentReceipt" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceShipmentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceShipmentReceiptLine" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "costMinor" BIGINT NOT NULL,

    CONSTRAINT "FinanceShipmentReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceShipment_bookId_status_createdAt_idx" ON "FinanceShipment"("bookId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceShipment_bookId_supplierId_createdAt_idx" ON "FinanceShipment"("bookId", "supplierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceShipment_bookId_id_key" ON "FinanceShipment"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceShipmentRate_shipmentId_currencyCode_key" ON "FinanceShipmentRate"("shipmentId", "currencyCode");

-- CreateIndex
CREATE INDEX "FinanceShipmentLine_tenantId_balanceSourceId_idx" ON "FinanceShipmentLine"("tenantId", "balanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceShipmentLine_shipmentId_position_key" ON "FinanceShipmentLine"("shipmentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceShipmentLine_shipmentId_id_key" ON "FinanceShipmentLine"("shipmentId", "id");

-- CreateIndex
CREATE INDEX "FinanceShipmentCostAdjustment_shipmentId_createdAt_idx" ON "FinanceShipmentCostAdjustment"("shipmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceShipmentReceipt_billId_key" ON "FinanceShipmentReceipt"("billId");

-- CreateIndex
CREATE INDEX "FinanceShipmentReceipt_shipmentId_receivedAt_idx" ON "FinanceShipmentReceipt"("shipmentId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceShipmentReceipt_shipmentId_id_key" ON "FinanceShipmentReceipt"("shipmentId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceShipmentReceipt_bookId_billId_key" ON "FinanceShipmentReceipt"("bookId", "billId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceShipmentReceiptLine_receiptId_lineId_key" ON "FinanceShipmentReceiptLine"("receiptId", "lineId");

-- AddForeignKey
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_bookId_supplierId_fkey" FOREIGN KEY ("bookId", "supplierId") REFERENCES "FinanceSupplierAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipmentRate" ADD CONSTRAINT "FinanceShipmentRate_bookId_shipmentId_fkey" FOREIGN KEY ("bookId", "shipmentId") REFERENCES "FinanceShipment"("bookId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipmentLine" ADD CONSTRAINT "FinanceShipmentLine_bookId_shipmentId_fkey" FOREIGN KEY ("bookId", "shipmentId") REFERENCES "FinanceShipment"("bookId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipmentLine" ADD CONSTRAINT "FinanceShipmentLine_tenantId_balanceSourceId_fkey" FOREIGN KEY ("tenantId", "balanceSourceId") REFERENCES "StockBalanceSource"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipmentCostAdjustment" ADD CONSTRAINT "FinanceShipmentCostAdjustment_bookId_shipmentId_fkey" FOREIGN KEY ("bookId", "shipmentId") REFERENCES "FinanceShipment"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipmentCostAdjustment" ADD CONSTRAINT "FinanceShipmentCostAdjustment_shipmentId_lineId_fkey" FOREIGN KEY ("shipmentId", "lineId") REFERENCES "FinanceShipmentLine"("shipmentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipmentReceipt" ADD CONSTRAINT "FinanceShipmentReceipt_bookId_shipmentId_fkey" FOREIGN KEY ("bookId", "shipmentId") REFERENCES "FinanceShipment"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipmentReceipt" ADD CONSTRAINT "FinanceShipmentReceipt_bookId_billId_fkey" FOREIGN KEY ("bookId", "billId") REFERENCES "FinanceBill"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipmentReceiptLine" ADD CONSTRAINT "FinanceShipmentReceiptLine_shipmentId_receiptId_fkey" FOREIGN KEY ("shipmentId", "receiptId") REFERENCES "FinanceShipmentReceipt"("shipmentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipmentReceiptLine" ADD CONSTRAINT "FinanceShipmentReceiptLine_shipmentId_lineId_fkey" FOREIGN KEY ("shipmentId", "lineId") REFERENCES "FinanceShipmentLine"("shipmentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
