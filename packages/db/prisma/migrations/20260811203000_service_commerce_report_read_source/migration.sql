-- CreateEnum
CREATE TYPE "ServiceCommerceReportReadSource" AS ENUM ('SERVICE_COMMERCE_REPORTING');

-- DropForeignKey
ALTER TABLE "ServiceCommerceReportReadAuditEvent" DROP CONSTRAINT "ServiceCommerceReportReadAuditEvent_storeId_fkey";

-- AlterTable
ALTER TABLE "ServiceCommerceReportReadAuditEvent" ADD COLUMN     "source" "ServiceCommerceReportReadSource" NOT NULL DEFAULT 'SERVICE_COMMERCE_REPORTING';

-- AddForeignKey
ALTER TABLE "ServiceCommerceReportReadAuditEvent" ADD CONSTRAINT "ServiceCommerceReportReadAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
