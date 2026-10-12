-- AlterEnum
ALTER TYPE "CommercialOrderReminderTiming" ADD VALUE 'OVERDUE';

-- AlterTable
ALTER TABLE "CommercialOrderReminderDelivery" ADD COLUMN     "digestId" TEXT;

-- CreateTable
CREATE TABLE "CommercialOrderReminderDigest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "localDate" TEXT NOT NULL,
    "status" "CommercialOrderReminderDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialOrderReminderDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialOrderReminderDigest_tenantId_status_createdAt_idx" ON "CommercialOrderReminderDigest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderReminderDigest_tenantId_localDate_recipientE_key" ON "CommercialOrderReminderDigest"("tenantId", "localDate", "recipientEmail");

-- CreateIndex
CREATE INDEX "CommercialOrderReminderDelivery_digestId_idx" ON "CommercialOrderReminderDelivery"("digestId");

-- AddForeignKey
ALTER TABLE "CommercialOrderReminderDelivery" ADD CONSTRAINT "CommercialOrderReminderDelivery_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "CommercialOrderReminderDigest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderReminderDigest" ADD CONSTRAINT "CommercialOrderReminderDigest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

