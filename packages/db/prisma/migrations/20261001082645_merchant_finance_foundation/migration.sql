-- CreateEnum
CREATE TYPE "FinanceAccountKind" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceAccountPurpose" AS ENUM ('CASH', 'BANK', 'CLEARING', 'RECEIVABLE', 'PAYABLE', 'CUSTOMER_ADVANCE', 'SUPPLIER_ADVANCE', 'INVENTORY', 'SALES', 'COST_OF_SALES', 'OPERATING_EXPENSE', 'CAPITAL', 'DRAWINGS', 'OPENING_EQUITY', 'OTHER');

-- CreateTable
CREATE TABLE "FinanceBook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "closedThrough" TIMESTAMP(3),
    "lastSequence" BIGINT NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FinanceAccountKind" NOT NULL,
    "purpose" "FinanceAccountPurpose" NOT NULL DEFAULT 'OTHER',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceJournalEntry" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "storeId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversalOfId" TEXT,

    CONSTRAINT "FinanceJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceJournalLine" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitMinor" BIGINT NOT NULL DEFAULT 0,
    "creditMinor" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "FinanceJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCommand" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePeriod" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reason" TEXT,

    CONSTRAINT "FinancePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReconciliation" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "snapshotSequence" BIGINT NOT NULL,
    "expectedBalanceMinor" BIGINT NOT NULL,
    "observedBalanceMinor" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBook_tenantId_currencyCode_key" ON "FinanceBook"("tenantId", "currencyCode");

-- CreateIndex
CREATE INDEX "FinanceAccount_bookId_purpose_idx" ON "FinanceAccount"("bookId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_bookId_code_key" ON "FinanceAccount"("bookId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_bookId_id_key" ON "FinanceAccount"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceJournalEntry_reversalOfId_key" ON "FinanceJournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinanceJournalEntry_bookId_effectiveAt_sequence_idx" ON "FinanceJournalEntry"("bookId", "effectiveAt", "sequence");

-- CreateIndex
CREATE INDEX "FinanceJournalEntry_bookId_storeId_effectiveAt_idx" ON "FinanceJournalEntry"("bookId", "storeId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceJournalEntry_bookId_id_key" ON "FinanceJournalEntry"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceJournalEntry_bookId_sequence_key" ON "FinanceJournalEntry"("bookId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceJournalEntry_bookId_sourceKind_sourceId_key" ON "FinanceJournalEntry"("bookId", "sourceKind", "sourceId");

-- CreateIndex
CREATE INDEX "FinanceJournalLine_bookId_accountId_entryId_idx" ON "FinanceJournalLine"("bookId", "accountId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCommand_bookId_clientCommandId_key" ON "FinanceCommand"("bookId", "clientCommandId");

-- CreateIndex
CREATE INDEX "FinancePeriod_bookId_endsAt_idx" ON "FinancePeriod"("bookId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriod_bookId_startsAt_key" ON "FinancePeriod"("bookId", "startsAt");

-- CreateIndex
CREATE INDEX "FinanceReconciliation_bookId_accountId_asOf_idx" ON "FinanceReconciliation"("bookId", "accountId", "asOf");

-- AddForeignKey
ALTER TABLE "FinanceBook" ADD CONSTRAINT "FinanceBook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceJournalEntry" ADD CONSTRAINT "FinanceJournalEntry_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceJournalEntry" ADD CONSTRAINT "FinanceJournalEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceJournalEntry" ADD CONSTRAINT "FinanceJournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinanceJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceJournalLine" ADD CONSTRAINT "FinanceJournalLine_bookId_entryId_fkey" FOREIGN KEY ("bookId", "entryId") REFERENCES "FinanceJournalEntry"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceJournalLine" ADD CONSTRAINT "FinanceJournalLine_bookId_accountId_fkey" FOREIGN KEY ("bookId", "accountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommand" ADD CONSTRAINT "FinanceCommand_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePeriod" ADD CONSTRAINT "FinancePeriod_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReconciliation" ADD CONSTRAINT "FinanceReconciliation_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReconciliation" ADD CONSTRAINT "FinanceReconciliation_bookId_accountId_fkey" FOREIGN KEY ("bookId", "accountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
