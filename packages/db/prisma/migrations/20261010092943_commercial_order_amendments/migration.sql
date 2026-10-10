-- CreateEnum
CREATE TYPE "CommercialOrderAmendmentKind" AS ENUM ('METADATA', 'CANCEL', 'REPLACE');

-- CreateTable
CREATE TABLE "CommercialOrderAmendment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "replacementOrderId" TEXT,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "kind" "CommercialOrderAmendmentKind" NOT NULL,
    "beforeSnapshot" JSONB NOT NULL,
    "afterSnapshot" JSONB NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOrderAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialOrderAmendment_tenantId_orderId_createdAt_idx" ON "CommercialOrderAmendment"("tenantId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialOrderAmendment_tenantId_replacementOrderId_idx" ON "CommercialOrderAmendment"("tenantId", "replacementOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderAmendment_tenantId_clientOperationId_key" ON "CommercialOrderAmendment"("tenantId", "clientOperationId");

-- AddForeignKey
ALTER TABLE "CommercialOrderAmendment" ADD CONSTRAINT "CommercialOrderAmendment_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "CommercialOrder"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderAmendment" ADD CONSTRAINT "CommercialOrderAmendment_tenantId_replacementOrderId_fkey" FOREIGN KEY ("tenantId", "replacementOrderId") REFERENCES "CommercialOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
