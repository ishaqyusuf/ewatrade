/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,committedOperationId]` on the table `StockReservation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "StockReservation" ADD COLUMN     "committedOperationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_tenantId_committedOperationId_key" ON "StockReservation"("tenantId", "committedOperationId");

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_tenantId_committedOperationId_fkey" FOREIGN KEY ("tenantId", "committedOperationId") REFERENCES "StockOperation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
