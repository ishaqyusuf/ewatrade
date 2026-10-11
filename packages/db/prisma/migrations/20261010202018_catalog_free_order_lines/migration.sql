/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,systemRole]` on the table `CatalogItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CatalogSystemRole" AS ENUM ('QUICK_SALE', 'ADDITIONAL_COST');

-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN     "systemRole" "CatalogSystemRole";

-- AlterTable
ALTER TABLE "OfferingSnapshot" ADD COLUMN     "customLineRole" "CatalogSystemRole";

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_tenantId_systemRole_key" ON "CatalogItem"("tenantId", "systemRole");
