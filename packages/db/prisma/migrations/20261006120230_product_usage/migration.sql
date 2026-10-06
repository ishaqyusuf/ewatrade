-- CreateEnum
CREATE TYPE "ProductUsage" AS ENUM ('FOR_SALE', 'INTERNAL_USE', 'BOTH');

-- AlterTable
ALTER TABLE "CatalogProduct" ADD COLUMN     "usage" "ProductUsage" NOT NULL DEFAULT 'FOR_SALE';
