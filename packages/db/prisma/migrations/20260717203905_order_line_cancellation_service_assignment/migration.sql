-- CreateEnum
CREATE TYPE "OrderPaymentEventType" AS ENUM ('REFUND', 'CORRECTION');

-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_REVERSAL';

-- AlterEnum
ALTER TYPE "ServiceJobEventType" ADD VALUE 'ASSIGNED';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" TEXT;

-- AlterTable
ALTER TABLE "ServiceJobLine" ADD COLUMN     "cancellationNote" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" TEXT;

-- CreateTable
CREATE TABLE "OrderPaymentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderPaymentEventType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paymentMethod" TEXT,
    "externalId" TEXT,
    "note" TEXT,
    "actorUserId" TEXT,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderPaymentEvent_orderId_happenedAt_idx" ON "OrderPaymentEvent"("orderId", "happenedAt");

-- CreateIndex
CREATE INDEX "OrderPaymentEvent_tenantId_storeId_happenedAt_idx" ON "OrderPaymentEvent"("tenantId", "storeId", "happenedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPaymentEvent_tenantId_storeId_type_externalId_key" ON "OrderPaymentEvent"("tenantId", "storeId", "type", "externalId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_cancelledAt_idx" ON "OrderItem"("orderId", "cancelledAt");

-- CreateIndex
CREATE INDEX "ServiceJobLine_serviceJobId_cancelledAt_idx" ON "ServiceJobLine"("serviceJobId", "cancelledAt");

-- AddForeignKey
ALTER TABLE "OrderPaymentEvent" ADD CONSTRAINT "OrderPaymentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPaymentEvent" ADD CONSTRAINT "OrderPaymentEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPaymentEvent" ADD CONSTRAINT "OrderPaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
