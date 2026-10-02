-- CreateEnum
CREATE TYPE "FinanceSupplierEntryKind" AS ENUM ('OPENING_PAYABLE', 'OPENING_ADVANCE', 'ADVANCE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FinanceSupplierSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateTable
CREATE TABLE "FinanceSupplierAccount" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSupplierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSupplierEntry" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "kind" "FinanceSupplierEntryKind" NOT NULL,
    "side" "FinanceSupplierSide" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "moneyAccountId" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reversalOfId" TEXT,

    CONSTRAINT "FinanceSupplierEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierAccount_bookId_code_key" ON "FinanceSupplierAccount"("bookId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierAccount_bookId_id_key" ON "FinanceSupplierAccount"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierEntry_journalEntryId_key" ON "FinanceSupplierEntry"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierEntry_reversalOfId_key" ON "FinanceSupplierEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinanceSupplierEntry_bookId_supplierId_effectiveAt_idx" ON "FinanceSupplierEntry"("bookId", "supplierId", "effectiveAt");

-- CreateIndex
CREATE INDEX "FinanceSupplierEntry_bookId_moneyAccountId_idx" ON "FinanceSupplierEntry"("bookId", "moneyAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierEntry_bookId_id_key" ON "FinanceSupplierEntry"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSupplierEntry_bookId_supplierId_id_key" ON "FinanceSupplierEntry"("bookId", "supplierId", "id");

-- AddForeignKey
ALTER TABLE "FinanceSupplierAccount" ADD CONSTRAINT "FinanceSupplierAccount_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierEntry" ADD CONSTRAINT "FinanceSupplierEntry_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierEntry" ADD CONSTRAINT "FinanceSupplierEntry_bookId_supplierId_fkey" FOREIGN KEY ("bookId", "supplierId") REFERENCES "FinanceSupplierAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierEntry" ADD CONSTRAINT "FinanceSupplierEntry_bookId_journalEntryId_fkey" FOREIGN KEY ("bookId", "journalEntryId") REFERENCES "FinanceJournalEntry"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierEntry" ADD CONSTRAINT "FinanceSupplierEntry_bookId_moneyAccountId_fkey" FOREIGN KEY ("bookId", "moneyAccountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSupplierEntry" ADD CONSTRAINT "FinanceSupplierEntry_bookId_supplierId_reversalOfId_fkey" FOREIGN KEY ("bookId", "supplierId", "reversalOfId") REFERENCES "FinanceSupplierEntry"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
