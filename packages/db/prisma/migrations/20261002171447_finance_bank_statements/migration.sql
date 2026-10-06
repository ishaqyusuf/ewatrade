-- CreateEnum
CREATE TYPE "FinanceBankMatchKind" AS ENUM ('MATCH', 'UNMATCH');

-- AlterTable
ALTER TABLE "FinanceJournalLine" ADD COLUMN     "activeBankMatchId" TEXT;

-- CreateTable
CREATE TABLE "FinanceBankAccountState" (
    "bookId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "FinanceBankAccountState_pkey" PRIMARY KEY ("bookId","accountId")
);

-- CreateTable
CREATE TABLE "FinanceBankStatement" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "openingBalanceMinor" BIGINT NOT NULL,
    "closingBalanceMinor" BIGINT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "importedRevision" BIGINT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankStatementLine" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "activeMatchId" TEXT,

    CONSTRAINT "FinanceBankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankMatchEvent" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "FinanceBankMatchKind" NOT NULL,
    "revision" BIGINT NOT NULL,
    "snapshotSequence" BIGINT NOT NULL,
    "bankRows" JSONB NOT NULL,
    "journalLines" JSONB NOT NULL,
    "amountMinor" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversalOfId" TEXT,

    CONSTRAINT "FinanceBankMatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceBankStatement_bookId_accountId_startsAt_endsAt_idx" ON "FinanceBankStatement"("bookId", "accountId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankStatement_bookId_accountId_id_key" ON "FinanceBankStatement"("bookId", "accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankStatement_bookId_accountId_reference_key" ON "FinanceBankStatement"("bookId", "accountId", "reference");

-- CreateIndex
CREATE INDEX "FinanceBankStatementLine_bookId_accountId_occurredAt_idx" ON "FinanceBankStatementLine"("bookId", "accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceBankStatementLine_activeMatchId_idx" ON "FinanceBankStatementLine"("activeMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankStatementLine_statementId_position_key" ON "FinanceBankStatementLine"("statementId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankStatementLine_bookId_accountId_externalId_key" ON "FinanceBankStatementLine"("bookId", "accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchEvent_reversalOfId_key" ON "FinanceBankMatchEvent"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchEvent_bookId_accountId_id_key" ON "FinanceBankMatchEvent"("bookId", "accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchEvent_bookId_accountId_revision_key" ON "FinanceBankMatchEvent"("bookId", "accountId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchEvent_bookId_accountId_reversalOfId_key" ON "FinanceBankMatchEvent"("bookId", "accountId", "reversalOfId");

-- CreateIndex
CREATE INDEX "FinanceJournalLine_activeBankMatchId_idx" ON "FinanceJournalLine"("activeBankMatchId");

-- AddForeignKey
ALTER TABLE "FinanceBankAccountState" ADD CONSTRAINT "FinanceBankAccountState_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankAccountState" ADD CONSTRAINT "FinanceBankAccountState_bookId_accountId_fkey" FOREIGN KEY ("bookId", "accountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankStatement" ADD CONSTRAINT "FinanceBankStatement_bookId_accountId_fkey" FOREIGN KEY ("bookId", "accountId") REFERENCES "FinanceBankAccountState"("bookId", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankStatementLine" ADD CONSTRAINT "FinanceBankStatementLine_bookId_accountId_statementId_fkey" FOREIGN KEY ("bookId", "accountId", "statementId") REFERENCES "FinanceBankStatement"("bookId", "accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankStatementLine" ADD CONSTRAINT "FinanceBankStatementLine_bookId_accountId_activeMatchId_fkey" FOREIGN KEY ("bookId", "accountId", "activeMatchId") REFERENCES "FinanceBankMatchEvent"("bookId", "accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchEvent" ADD CONSTRAINT "FinanceBankMatchEvent_bookId_accountId_fkey" FOREIGN KEY ("bookId", "accountId") REFERENCES "FinanceBankAccountState"("bookId", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchEvent" ADD CONSTRAINT "FinanceBankMatchEvent_bookId_accountId_reversalOfId_fkey" FOREIGN KEY ("bookId", "accountId", "reversalOfId") REFERENCES "FinanceBankMatchEvent"("bookId", "accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceJournalLine" ADD CONSTRAINT "FinanceJournalLine_bookId_accountId_activeBankMatchId_fkey" FOREIGN KEY ("bookId", "accountId", "activeBankMatchId") REFERENCES "FinanceBankMatchEvent"("bookId", "accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
