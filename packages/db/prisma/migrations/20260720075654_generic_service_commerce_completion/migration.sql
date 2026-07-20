-- CreateEnum
CREATE TYPE "ServiceLevel" AS ENUM ('STANDARD', 'EXPRESS');

-- CreateEnum
CREATE TYPE "ServiceSurchargeType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "CommercialPaymentType" AS ENUM ('PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "CommercialPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'POS', 'OTHER');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_PAID';

-- AlterTable
ALTER TABLE "CommercialOrder" ADD COLUMN     "amountPaidMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serviceChargeMinor" INTEGER NOT NULL DEFAULT 0;

-- Backfill orders that were already settled before itemized payments existed.
UPDATE "CommercialOrder"
SET "amountPaidMinor" = "totalMinor"
WHERE "paymentStatus" = 'PAID';

-- AlterTable
ALTER TABLE "ServiceIntake" ADD COLUMN     "initialPaymentMethod" "CommercialPaymentMethod",
ADD COLUMN     "initialPaymentMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "initialPaymentReference" TEXT,
ADD COLUMN     "notificationChannel" "ServiceNotificationChannel",
ADD COLUMN     "serviceChargeMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serviceLevel" "ServiceLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "serviceLevelSnapshot" JSONB;

-- AlterTable
ALTER TABLE "ServiceJob" ADD COLUMN     "handedOffAt" TIMESTAMP(3),
ADD COLUMN     "handedOffByUserId" TEXT,
ADD COLUMN     "handoffNote" TEXT;

-- AlterTable
ALTER TABLE "ServiceNotificationIntent" ADD COLUMN     "channel" "ServiceNotificationChannel" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "dispatchRequestedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledFor" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommercialOrderPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientPaymentId" TEXT NOT NULL,
    "type" "CommercialPaymentType" NOT NULL DEFAULT 'PAYMENT',
    "method" "CommercialPaymentMethod" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStoreSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "expressEnabled" BOOLEAN NOT NULL DEFAULT false,
    "expressLabel" TEXT NOT NULL DEFAULT 'Express',
    "expressSurchargeType" "ServiceSurchargeType" NOT NULL DEFAULT 'PERCENTAGE',
    "expressSurchargeValue" INTEGER NOT NULL DEFAULT 0,
    "expressTurnaroundMinutes" INTEGER,
    "reminderLeadMinutes" INTEGER NOT NULL DEFAULT 1440,
    "autoNotifyReady" BOOLEAN NOT NULL DEFAULT false,
    "autoNotifyReminder" BOOLEAN NOT NULL DEFAULT false,
    "defaultNotificationChannel" "ServiceNotificationChannel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceStoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialOrderPayment_orderId_recordedAt_idx" ON "CommercialOrderPayment"("orderId", "recordedAt");

-- CreateIndex
CREATE INDEX "CommercialOrderPayment_tenantId_storeId_recordedAt_idx" ON "CommercialOrderPayment"("tenantId", "storeId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderPayment_tenantId_clientPaymentId_key" ON "CommercialOrderPayment"("tenantId", "clientPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceStoreSettings_storeId_key" ON "ServiceStoreSettings"("storeId");

-- CreateIndex
CREATE INDEX "ServiceStoreSettings_tenantId_updatedAt_idx" ON "ServiceStoreSettings"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "ServiceNotificationIntent_status_scheduledFor_idx" ON "ServiceNotificationIntent"("status", "scheduledFor");

-- AddForeignKey
ALTER TABLE "CommercialOrderPayment" ADD CONSTRAINT "CommercialOrderPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderPayment" ADD CONSTRAINT "CommercialOrderPayment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderPayment" ADD CONSTRAINT "CommercialOrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStoreSettings" ADD CONSTRAINT "ServiceStoreSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStoreSettings" ADD CONSTRAINT "ServiceStoreSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
