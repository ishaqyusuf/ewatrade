-- AlterTable
ALTER TABLE "BusinessGrowthSnapshot" ADD COLUMN     "ordersLastMonth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "salesMinorLastMonth" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "storefrontPublishedAt" TIMESTAMP(3);
