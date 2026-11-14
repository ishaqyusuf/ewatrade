-- CreateEnum
CREATE TYPE "ReturnableMovementKind" AS ENUM ('ISSUED', 'RETURNED', 'WRITTEN_OFF');

-- AlterEnum
ALTER TYPE "ProductUsage" ADD VALUE 'RETURNABLE';

-- CreateTable
CREATE TABLE "ReturnableMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "customerId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" "ReturnableMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'staff',
    "actorUserId" TEXT NOT NULL,
    "clientMovementId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnableMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnableMovement_tenantId_customerId_catalogItemId_idx" ON "ReturnableMovement"("tenantId", "customerId", "catalogItemId");

-- CreateIndex
CREATE INDEX "ReturnableMovement_tenantId_orderId_idx" ON "ReturnableMovement"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "ReturnableMovement_tenantId_catalogItemId_occurredAt_idx" ON "ReturnableMovement"("tenantId", "catalogItemId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnableMovement_tenantId_clientMovementId_key" ON "ReturnableMovement"("tenantId", "clientMovementId");

-- AddForeignKey
ALTER TABLE "ReturnableMovement" ADD CONSTRAINT "ReturnableMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnableMovement" ADD CONSTRAINT "ReturnableMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnableMovement" ADD CONSTRAINT "ReturnableMovement_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnableMovement" ADD CONSTRAINT "ReturnableMovement_tenantId_catalogItemId_fkey" FOREIGN KEY ("tenantId", "catalogItemId") REFERENCES "CatalogItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnableMovement" ADD CONSTRAINT "ReturnableMovement_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "CommercialOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
