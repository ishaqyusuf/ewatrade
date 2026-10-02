-- CreateTable
CREATE TABLE "CustomerLedgerReceipt" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "moneyAccountId" TEXT NOT NULL,
    "method" "CommercialPaymentMethod" NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerReceipt_entryId_key" ON "CustomerLedgerReceipt"("entryId");

-- CreateIndex
CREATE INDEX "CustomerLedgerReceipt_bookId_moneyAccountId_createdAt_idx" ON "CustomerLedgerReceipt"("bookId", "moneyAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerReceipt_accountId_entryId_key" ON "CustomerLedgerReceipt"("accountId", "entryId");

-- AddForeignKey
ALTER TABLE "CustomerLedgerReceipt" ADD CONSTRAINT "CustomerLedgerReceipt_accountId_entryId_fkey" FOREIGN KEY ("accountId", "entryId") REFERENCES "CustomerLedgerEntry"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerReceipt" ADD CONSTRAINT "CustomerLedgerReceipt_bookId_moneyAccountId_fkey" FOREIGN KEY ("bookId", "moneyAccountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
