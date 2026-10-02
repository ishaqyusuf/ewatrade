/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,id]` on the table `StockOperation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "StockOperationCategoryName" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "normalizedName" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOperationCategoryName_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOperationCategory" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stockOperationId" TEXT NOT NULL,
    "categoryNameId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "StockOperationCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockOperationCategoryName_tenantId_id_key" ON "StockOperationCategoryName"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StockOperationCategoryName_tenantId_normalizedName_key" ON "StockOperationCategoryName"("tenantId", "normalizedName");

-- CreateIndex
CREATE INDEX "StockOperationCategory_tenantId_categoryNameId_stockOperati_idx" ON "StockOperationCategory"("tenantId", "categoryNameId", "stockOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockOperationCategory_tenantId_stockOperationId_categoryNa_key" ON "StockOperationCategory"("tenantId", "stockOperationId", "categoryNameId");

-- CreateIndex
CREATE UNIQUE INDEX "StockOperationCategory_tenantId_stockOperationId_position_key" ON "StockOperationCategory"("tenantId", "stockOperationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StockOperation_tenantId_id_key" ON "StockOperation"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "StockOperationCategoryName" ADD CONSTRAINT "StockOperationCategoryName_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOperationCategory" ADD CONSTRAINT "StockOperationCategory_tenantId_stockOperationId_fkey" FOREIGN KEY ("tenantId", "stockOperationId") REFERENCES "StockOperation"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOperationCategory" ADD CONSTRAINT "StockOperationCategory_tenantId_categoryNameId_fkey" FOREIGN KEY ("tenantId", "categoryNameId") REFERENCES "StockOperationCategoryName"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
