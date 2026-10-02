/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,bookId,id,balanceSourceId]` on the table `FinanceInventoryValuationEvent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,bookId,id]` on the table `FinanceProductReturnCostAllocation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FinanceInventoryCostReviewNodeKind" AS ENUM ('ORIGIN', 'WITHDRAWAL', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN_RESTOCK', 'RETURN_NON_RESTOCK', 'RESTORATION');

-- CreateEnum
CREATE TYPE "FinanceInventoryCostReviewEvidenceMode" AS ENUM ('RESOLVE_UNKNOWN', 'CORRECT_RECORDED');

-- CreateEnum
CREATE TYPE "FinanceInventoryCostReviewClassification" AS ENUM ('OPENING_BALANCE', 'ACQUISITION', 'OWNER_CONTRIBUTION', 'INVENTORY_GAIN', 'SOURCE_CORRECTION');

-- AlterTable
ALTER TABLE "FinanceInventoryPool" ADD COLUMN     "lastCostReviewSnapshotId" TEXT;

-- CreateTable
CREATE TABLE "FinanceInventoryCostReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "costTraceHash" TEXT NOT NULL,
    "reviewedSnapshotHash" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "evidenceCutoff" TIMESTAMP(3) NOT NULL,
    "historyThrough" TIMESTAMP(3) NOT NULL,
    "reviewedBookSequence" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "postingPlan" JSONB NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceInventoryCostReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInventoryCostReviewAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "balanceSourceId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "kind" "FinanceInventoryCostReviewNodeKind" NOT NULL,
    "withdrawalPurpose" TEXT,
    "ordinal" BIGINT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "quantityBefore" DECIMAL(38,18) NOT NULL,
    "quantityAfter" DECIMAL(38,18) NOT NULL,
    "recordedCostMinor" BIGINT,
    "resolvedCostMinor" BIGINT NOT NULL,
    "valuationEventId" TEXT,
    "stockOperationId" TEXT,
    "stockMovementId" TEXT,
    "productReturnAllocationId" TEXT,
    "originalSourceKey" TEXT,
    "originalRemainingQuantityBefore" DECIMAL(38,18),
    "returnOrdinal" BIGINT,
    "previousResolutionId" TEXT,

    CONSTRAINT "FinanceInventoryCostReviewAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInventoryCostReviewEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "mode" "FinanceInventoryCostReviewEvidenceMode" NOT NULL,
    "classification" "FinanceInventoryCostReviewClassification" NOT NULL,
    "originalCostMinor" BIGINT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "sourceDocumentKind" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "sourceEffectiveAt" TIMESTAMP(3) NOT NULL,
    "postingEffectiveAt" TIMESTAMP(3) NOT NULL,
    "counterAccountId" TEXT,
    "billLineId" TEXT,
    "sourceJournalEntryId" TEXT,
    "basis" JSONB NOT NULL,

    CONSTRAINT "FinanceInventoryCostReviewEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInventoryCostReviewPool" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "balanceSourceId" TEXT NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "valueBeforeMinor" BIGINT,
    "valueAfterMinor" BIGINT NOT NULL,
    "expectedStockRevision" INTEGER NOT NULL,
    "expectedMovementCount" BIGINT NOT NULL,
    "expectedValuationSequence" BIGINT NOT NULL,

    CONSTRAINT "FinanceInventoryCostReviewPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInventoryCostReviewJournal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "basis" JSONB NOT NULL,

    CONSTRAINT "FinanceInventoryCostReviewJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceInventoryCostReview_bookId_createdAt_id_idx" ON "FinanceInventoryCostReview"("bookId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReview_bookId_clientCommandId_key" ON "FinanceInventoryCostReview"("bookId", "clientCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReview_tenantId_bookId_id_key" ON "FinanceInventoryCostReview"("tenantId", "bookId", "id");

-- CreateIndex
CREATE INDEX "FinanceInventoryCostReviewAllocation_bookId_sourceKey_idx" ON "FinanceInventoryCostReviewAllocation"("bookId", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceInventoryCostReviewAllocation_tenantId_bookId_valuat_idx" ON "FinanceInventoryCostReviewAllocation"("tenantId", "bookId", "valuationEventId");

-- CreateIndex
CREATE INDEX "FinanceInventoryCostReviewAllocation_tenantId_bookId_produc_idx" ON "FinanceInventoryCostReviewAllocation"("tenantId", "bookId", "productReturnAllocationId");

-- CreateIndex
CREATE INDEX "FinanceInventoryCostReviewAllocation_stockOperationId_stock_idx" ON "FinanceInventoryCostReviewAllocation"("stockOperationId", "stockMovementId", "balanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewAllocation_tenantId_bookId_review_key" ON "FinanceInventoryCostReviewAllocation"("tenantId", "bookId", "reviewId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewAllocation_bookId_reviewId_source_key" ON "FinanceInventoryCostReviewAllocation"("bookId", "reviewId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewAllocation_bookId_reviewId_balanc_key" ON "FinanceInventoryCostReviewAllocation"("bookId", "reviewId", "balanceSourceId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewAllocation_bookId_sourceKey_id_key" ON "FinanceInventoryCostReviewAllocation"("bookId", "sourceKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewAllocation_bookId_sourceKey_previ_key" ON "FinanceInventoryCostReviewAllocation"("bookId", "sourceKey", "previousResolutionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewEvidence_tenantId_bookId_reviewId_key" ON "FinanceInventoryCostReviewEvidence"("tenantId", "bookId", "reviewId", "allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewPool_bookId_reviewId_poolId_key" ON "FinanceInventoryCostReviewPool"("bookId", "reviewId", "poolId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewPool_bookId_poolId_balanceSourceI_key" ON "FinanceInventoryCostReviewPool"("bookId", "poolId", "balanceSourceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewJournal_bookId_journalEntryId_key" ON "FinanceInventoryCostReviewJournal"("bookId", "journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryCostReviewJournal_bookId_reviewId_groupKey_key" ON "FinanceInventoryCostReviewJournal"("bookId", "reviewId", "groupKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_tenantId_bookId_id_balanceSo_key" ON "FinanceInventoryValuationEvent"("tenantId", "bookId", "id", "balanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceProductReturnCostAllocation_tenantId_bookId_id_key" ON "FinanceProductReturnCostAllocation"("tenantId", "bookId", "id");

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReview" ADD CONSTRAINT "FinanceInventoryCostReview_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewAllocation" ADD CONSTRAINT "FinanceInventoryCostReviewAllocation_tenantId_bookId_revie_fkey" FOREIGN KEY ("tenantId", "bookId", "reviewId") REFERENCES "FinanceInventoryCostReview"("tenantId", "bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewAllocation" ADD CONSTRAINT "FinanceInventoryCostReviewAllocation_bookId_poolId_balance_fkey" FOREIGN KEY ("bookId", "poolId", "balanceSourceId") REFERENCES "FinanceInventoryPool"("bookId", "id", "balanceSourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewAllocation" ADD CONSTRAINT "FinanceInventoryCostReviewAllocation_tenantId_bookId_valua_fkey" FOREIGN KEY ("tenantId", "bookId", "valuationEventId", "balanceSourceId") REFERENCES "FinanceInventoryValuationEvent"("tenantId", "bookId", "id", "balanceSourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewAllocation" ADD CONSTRAINT "FinanceInventoryCostReviewAllocation_stockOperationId_stoc_fkey" FOREIGN KEY ("stockOperationId", "stockMovementId", "balanceSourceId") REFERENCES "StockMovement"("operationId", "id", "balanceSourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewAllocation" ADD CONSTRAINT "FinanceInventoryCostReviewAllocation_tenantId_bookId_produ_fkey" FOREIGN KEY ("tenantId", "bookId", "productReturnAllocationId") REFERENCES "FinanceProductReturnCostAllocation"("tenantId", "bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewAllocation" ADD CONSTRAINT "FinanceInventoryCostReviewAllocation_bookId_reviewId_origi_fkey" FOREIGN KEY ("bookId", "reviewId", "originalSourceKey") REFERENCES "FinanceInventoryCostReviewAllocation"("bookId", "reviewId", "sourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewAllocation" ADD CONSTRAINT "FinanceInventoryCostReviewAllocation_bookId_sourceKey_prev_fkey" FOREIGN KEY ("bookId", "sourceKey", "previousResolutionId") REFERENCES "FinanceInventoryCostReviewAllocation"("bookId", "sourceKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewEvidence" ADD CONSTRAINT "InventoryCostReviewEvidence_review_fkey" FOREIGN KEY ("tenantId", "bookId", "reviewId") REFERENCES "FinanceInventoryCostReview"("tenantId", "bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewEvidence" ADD CONSTRAINT "InventoryCostReviewEvidence_allocation_fkey" FOREIGN KEY ("tenantId", "bookId", "reviewId", "allocationId") REFERENCES "FinanceInventoryCostReviewAllocation"("tenantId", "bookId", "reviewId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewEvidence" ADD CONSTRAINT "FinanceInventoryCostReviewEvidence_bookId_counterAccountId_fkey" FOREIGN KEY ("bookId", "counterAccountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewEvidence" ADD CONSTRAINT "FinanceInventoryCostReviewEvidence_bookId_billLineId_fkey" FOREIGN KEY ("bookId", "billLineId") REFERENCES "FinanceBillLine"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewEvidence" ADD CONSTRAINT "FinanceInventoryCostReviewEvidence_bookId_sourceJournalEnt_fkey" FOREIGN KEY ("bookId", "sourceJournalEntryId") REFERENCES "FinanceJournalEntry"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewPool" ADD CONSTRAINT "FinanceInventoryCostReviewPool_tenantId_bookId_reviewId_fkey" FOREIGN KEY ("tenantId", "bookId", "reviewId") REFERENCES "FinanceInventoryCostReview"("tenantId", "bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewPool" ADD CONSTRAINT "FinanceInventoryCostReviewPool_bookId_poolId_balanceSource_fkey" FOREIGN KEY ("bookId", "poolId", "balanceSourceId") REFERENCES "FinanceInventoryPool"("bookId", "id", "balanceSourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewJournal" ADD CONSTRAINT "FinanceInventoryCostReviewJournal_tenantId_bookId_reviewId_fkey" FOREIGN KEY ("tenantId", "bookId", "reviewId") REFERENCES "FinanceInventoryCostReview"("tenantId", "bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryCostReviewJournal" ADD CONSTRAINT "FinanceInventoryCostReviewJournal_bookId_journalEntryId_fkey" FOREIGN KEY ("bookId", "journalEntryId") REFERENCES "FinanceJournalEntry"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryPool" ADD CONSTRAINT "FinanceInventoryPool_bookId_id_balanceSourceId_lastCostRev_fkey" FOREIGN KEY ("bookId", "id", "balanceSourceId", "lastCostReviewSnapshotId") REFERENCES "FinanceInventoryCostReviewPool"("bookId", "poolId", "balanceSourceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
