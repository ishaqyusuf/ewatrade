-- CreateEnum
CREATE TYPE "FinanceFiscalCloseEventKind" AS ENUM ('CLOSE', 'REVERSE');

-- AlterEnum
ALTER TYPE "FinanceAccountPurpose" ADD VALUE 'RETAINED_EARNINGS';

-- CreateTable
CREATE TABLE "FinanceFiscalCalendar" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "startDay" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "retainedEarningsAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceFiscalCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceFiscalYear" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "calendarRevision" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "startDay" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "firstPeriodStub" BOOLEAN NOT NULL,
    "activeCloseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceFiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceFiscalCloseEvent" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "kind" "FinanceFiscalCloseEventKind" NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "retainedEarningsAccountId" TEXT NOT NULL,
    "snapshotSequence" BIGINT NOT NULL,
    "resultingSequence" BIGINT NOT NULL,
    "earningsMinor" TEXT NOT NULL,
    "accountBalances" JSONB NOT NULL,
    "sourceEvidence" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversalOfId" TEXT,

    CONSTRAINT "FinanceFiscalCloseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceFiscalCloseJournal" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FinanceFiscalCloseJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCalendar_bookId_key" ON "FinanceFiscalCalendar"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCalendar_bookId_id_key" ON "FinanceFiscalCalendar"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalYear_activeCloseId_key" ON "FinanceFiscalYear"("activeCloseId");

-- CreateIndex
CREATE INDEX "FinanceFiscalYear_bookId_endsAt_idx" ON "FinanceFiscalYear"("bookId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalYear_bookId_id_key" ON "FinanceFiscalYear"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalYear_bookId_startsAt_key" ON "FinanceFiscalYear"("bookId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalYear_bookId_id_activeCloseId_key" ON "FinanceFiscalYear"("bookId", "id", "activeCloseId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCloseEvent_reversalOfId_key" ON "FinanceFiscalCloseEvent"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinanceFiscalCloseEvent_bookId_fiscalYearId_recordedAt_idx" ON "FinanceFiscalCloseEvent"("bookId", "fiscalYearId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCloseEvent_bookId_id_key" ON "FinanceFiscalCloseEvent"("bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCloseEvent_bookId_fiscalYearId_id_key" ON "FinanceFiscalCloseEvent"("bookId", "fiscalYearId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCloseEvent_bookId_clientCommandId_key" ON "FinanceFiscalCloseEvent"("bookId", "clientCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCloseEvent_bookId_fiscalYearId_reversalOfId_key" ON "FinanceFiscalCloseEvent"("bookId", "fiscalYearId", "reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCloseJournal_journalEntryId_key" ON "FinanceFiscalCloseJournal"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCloseJournal_eventId_position_key" ON "FinanceFiscalCloseJournal"("eventId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFiscalCloseJournal_bookId_journalEntryId_key" ON "FinanceFiscalCloseJournal"("bookId", "journalEntryId");

-- AddForeignKey
ALTER TABLE "FinanceFiscalCalendar" ADD CONSTRAINT "FinanceFiscalCalendar_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalCalendar" ADD CONSTRAINT "FinanceFiscalCalendar_bookId_retainedEarningsAccountId_fkey" FOREIGN KEY ("bookId", "retainedEarningsAccountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalYear" ADD CONSTRAINT "FinanceFiscalYear_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalYear" ADD CONSTRAINT "FinanceFiscalYear_bookId_calendarId_fkey" FOREIGN KEY ("bookId", "calendarId") REFERENCES "FinanceFiscalCalendar"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalYear" ADD CONSTRAINT "FinanceFiscalYear_activeClose_fkey" FOREIGN KEY ("bookId", "id", "activeCloseId") REFERENCES "FinanceFiscalCloseEvent"("bookId", "fiscalYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalCloseEvent" ADD CONSTRAINT "FinanceFiscalCloseEvent_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "FinanceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalCloseEvent" ADD CONSTRAINT "FinanceFiscalCloseEvent_bookId_fiscalYearId_fkey" FOREIGN KEY ("bookId", "fiscalYearId") REFERENCES "FinanceFiscalYear"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalCloseEvent" ADD CONSTRAINT "FinanceFiscalCloseEvent_bookId_retainedEarningsAccountId_fkey" FOREIGN KEY ("bookId", "retainedEarningsAccountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalCloseEvent" ADD CONSTRAINT "FinanceFiscalCloseEvent_original_fkey" FOREIGN KEY ("bookId", "fiscalYearId", "reversalOfId") REFERENCES "FinanceFiscalCloseEvent"("bookId", "fiscalYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalCloseJournal" ADD CONSTRAINT "FinanceFiscalCloseJournal_bookId_eventId_fkey" FOREIGN KEY ("bookId", "eventId") REFERENCES "FinanceFiscalCloseEvent"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFiscalCloseJournal" ADD CONSTRAINT "FinanceFiscalCloseJournal_bookId_journalEntryId_fkey" FOREIGN KEY ("bookId", "journalEntryId") REFERENCES "FinanceJournalEntry"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
