/*
  Warnings:

  - Added the required column `sequence` to the `CustomerLedgerAllocation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sequence` to the `CustomerLedgerAllocationRelease` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CustomerLedgerAllocation" ADD COLUMN     "sequence" BIGINT NOT NULL;

-- AlterTable
ALTER TABLE "CustomerLedgerAllocationRelease" ADD COLUMN     "sequence" BIGINT NOT NULL;
