-- CreateEnum
CREATE TYPE "ProductUnitPriceChangeSource" AS ENUM ('PRODUCT_SETUP', 'MANUAL', 'SYNC_REPLAY', 'IMPORT');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "unitTemplateId" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "unitTemplateId" TEXT,
ADD COLUMN "unitTemplateUnitId" TEXT,
ADD COLUMN "conversionRatioNumerator" INTEGER,
ADD COLUMN "conversionRatioDenominator" INTEGER;

-- CreateTable
CREATE TABLE "ProductUnitTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseUnitName" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUnitTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnitTemplateUnit" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratioNumerator" INTEGER NOT NULL DEFAULT 1,
    "ratioDenominator" INTEGER NOT NULL DEFAULT 1,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUnitTemplateUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnitPriceHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "previousPriceMinor" INTEGER,
    "priceMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByUserId" TEXT,
    "reason" TEXT,
    "source" "ProductUnitPriceChangeSource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUnitPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnitTemplate_key_key" ON "ProductUnitTemplate"("key");

-- CreateIndex
CREATE INDEX "ProductUnitTemplate_tenantId_isActive_sortOrder_idx" ON "ProductUnitTemplate"("tenantId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductUnitTemplate_isSystem_sortOrder_idx" ON "ProductUnitTemplate"("isSystem", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnitTemplateUnit_templateId_key_key" ON "ProductUnitTemplateUnit"("templateId", "key");

-- CreateIndex
CREATE INDEX "ProductUnitTemplateUnit_templateId_sortOrder_idx" ON "ProductUnitTemplateUnit"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductUnitTemplateUnit_templateId_isBase_idx" ON "ProductUnitTemplateUnit"("templateId", "isBase");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnitPriceHistory_tenantId_storeId_productVariantId_externalId_key" ON "ProductUnitPriceHistory"("tenantId", "storeId", "productVariantId", "externalId");

-- CreateIndex
CREATE INDEX "ProductUnitPriceHistory_tenantId_storeId_effectiveAt_idx" ON "ProductUnitPriceHistory"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ProductUnitPriceHistory_productId_effectiveAt_idx" ON "ProductUnitPriceHistory"("productId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ProductUnitPriceHistory_productVariantId_effectiveAt_idx" ON "ProductUnitPriceHistory"("productVariantId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ProductUnitPriceHistory_changedByUserId_effectiveAt_idx" ON "ProductUnitPriceHistory"("changedByUserId", "effectiveAt");

-- CreateIndex
CREATE INDEX "Product_unitTemplateId_idx" ON "Product"("unitTemplateId");

-- CreateIndex
CREATE INDEX "ProductVariant_unitTemplateId_idx" ON "ProductVariant"("unitTemplateId");

-- CreateIndex
CREATE INDEX "ProductVariant_unitTemplateUnitId_idx" ON "ProductVariant"("unitTemplateUnitId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitTemplateId_fkey" FOREIGN KEY ("unitTemplateId") REFERENCES "ProductUnitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_unitTemplateId_fkey" FOREIGN KEY ("unitTemplateId") REFERENCES "ProductUnitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_unitTemplateUnitId_fkey" FOREIGN KEY ("unitTemplateUnitId") REFERENCES "ProductUnitTemplateUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitTemplate" ADD CONSTRAINT "ProductUnitTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitTemplateUnit" ADD CONSTRAINT "ProductUnitTemplateUnit_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProductUnitTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitPriceHistory" ADD CONSTRAINT "ProductUnitPriceHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitPriceHistory" ADD CONSTRAINT "ProductUnitPriceHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitPriceHistory" ADD CONSTRAINT "ProductUnitPriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitPriceHistory" ADD CONSTRAINT "ProductUnitPriceHistory_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
