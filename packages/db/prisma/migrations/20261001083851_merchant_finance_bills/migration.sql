-- CreateEnum
CREATE TYPE "FinanceBillKind" AS ENUM ('EXPENSE', 'PURCHASE');

-- CreateTable
CREATE TABLE "FinanceBill" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "kind" "FinanceBillKind" NOT NULL DEFAULT 'EXPENSE',
    "payeeName" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "storeId" TEXT,
    "totalMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBillLine" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,

    CONSTRAINT "FinanceBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBillPayment" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceBill_bookId_incurredAt_id_idx" ON "FinanceBill"("bookId", "incurredAt", "id");

-- CreateIndex
CREATE INDEX "FinanceBill_bookId_storeId_dueAt_idx" ON "FinanceBill"("bookId", "storeId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBill_bookId_id_key" ON "FinanceBill"("bookId", "id");

-- CreateIndex
CREATE INDEX "FinanceBillLine_bookId_accountId_idx" ON "FinanceBillLine"("bookId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBillLine_billId_position_key" ON "FinanceBillLine"("billId", "position");

-- CreateIndex
CREATE INDEX "FinanceBillPayment_bookId_billId_effectiveAt_idx" ON "FinanceBillPayment"("bookId", "billId", "effectiveAt");

-- AddForeignKey
ALTER TABLE "FinanceBill" ADD CONSTRAINT "FinanceBill_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBill" ADD CONSTRAINT "FinanceBill_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBillLine" ADD CONSTRAINT "FinanceBillLine_bookId_billId_fkey" FOREIGN KEY ("bookId", "billId") REFERENCES "FinanceBill"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBillLine" ADD CONSTRAINT "FinanceBillLine_bookId_accountId_fkey" FOREIGN KEY ("bookId", "accountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBillPayment" ADD CONSTRAINT "FinanceBillPayment_bookId_billId_fkey" FOREIGN KEY ("bookId", "billId") REFERENCES "FinanceBill"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBillPayment" ADD CONSTRAINT "FinanceBillPayment_bookId_accountId_fkey" FOREIGN KEY ("bookId", "accountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
