/*
  Warnings:

  - A unique constraint covering the columns `[customerAllocationId]` on the table `CommercialOrderPayment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[customerAllocationReleaseId]` on the table `CommercialOrderPayment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "CommercialPaymentMethod" ADD VALUE 'CUSTOMER_CREDIT';

-- AlterTable
ALTER TABLE "CommercialOrderPayment" ADD COLUMN     "customerAllocationId" TEXT,
ADD COLUMN     "customerAllocationReleaseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderPayment_customerAllocationId_key" ON "CommercialOrderPayment"("customerAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderPayment_customerAllocationReleaseId_key" ON "CommercialOrderPayment"("customerAllocationReleaseId");

-- AddForeignKey
ALTER TABLE "CommercialOrderPayment" ADD CONSTRAINT "CommercialOrderPayment_customerAllocationId_fkey" FOREIGN KEY ("customerAllocationId") REFERENCES "CustomerLedgerAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderPayment" ADD CONSTRAINT "CommercialOrderPayment_customerAllocationReleaseId_fkey" FOREIGN KEY ("customerAllocationReleaseId") REFERENCES "CustomerLedgerAllocationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
