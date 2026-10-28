/*
  Warnings:

  - A unique constraint covering the columns `[customerReceiptId]` on the table `ManualPaymentReport` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[customerFundsRefundRequestId]` on the table `ManualPaymentReport` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ManualPaymentAllocationPreference" AS ENUM ('ORDER_MORE', 'CREDIT', 'REFUND', 'UNRESOLVED');

-- AlterTable
ALTER TABLE "ManualPaymentReport" ADD COLUMN     "allocationPreference" "ManualPaymentAllocationPreference",
ADD COLUMN     "customerCreditEntryId" TEXT,
ADD COLUMN     "customerFundsRefundRequestId" TEXT,
ADD COLUMN     "customerReceiptId" TEXT,
ADD COLUMN     "refundDestinationCiphertext" TEXT,
ADD COLUMN     "refundDestinationFingerprint" TEXT,
ADD COLUMN     "requestedApplyMinor" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentReport_customerReceiptId_key" ON "ManualPaymentReport"("customerReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentReport_customerFundsRefundRequestId_key" ON "ManualPaymentReport"("customerFundsRefundRequestId");
