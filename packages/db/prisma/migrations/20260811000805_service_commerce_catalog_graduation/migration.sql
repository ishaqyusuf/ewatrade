-- CreateEnum
CREATE TYPE "ServiceBookingPolicy" AS ENUM ('NOT_BOOKABLE', 'REQUEST_REQUIRED', 'BOOKING_REQUIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceCommerceStoreAuditEventType" ADD VALUE 'CATALOG_GRADUATED';
ALTER TYPE "ServiceCommerceStoreAuditEventType" ADD VALUE 'CATALOG_PUBLISHED';

-- AlterTable
ALTER TABLE "SellableOffering" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ServiceOffering" ADD COLUMN     "bookingPolicy" "ServiceBookingPolicy" NOT NULL DEFAULT 'NOT_BOOKABLE',
ADD COLUMN     "durationMinutes" INTEGER;
