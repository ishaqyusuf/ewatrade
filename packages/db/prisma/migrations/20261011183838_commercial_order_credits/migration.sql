-- CreateEnum
CREATE TYPE "CommercialOrderCreditKind" AS ENUM ('OVERCHARGE', 'RETURNED_ITEMS');

-- AlterTable
ALTER TABLE "CommercialOrder" ADD COLUMN     "creditMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CommercialOrderCredit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "kind" "CommercialOrderCreditKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "refundPaymentId" TEXT,
    "productReturnIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOrderCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialOrderCredit_orderId_createdAt_idx" ON "CommercialOrderCredit"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderCredit_tenantId_clientOperationId_key" ON "CommercialOrderCredit"("tenantId", "clientOperationId");

-- AddForeignKey
ALTER TABLE "CommercialOrderCredit" ADD CONSTRAINT "CommercialOrderCredit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
