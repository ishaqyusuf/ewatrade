-- CreateEnum
CREATE TYPE "CatalogRecordStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SellableOfferingKind" AS ENUM ('PRODUCT_UNIT', 'SERVICE');

-- CreateEnum
CREATE TYPE "OfferingPricingPolicy" AS ENUM ('FIXED', 'QUOTE_REQUIRED');

-- CreateEnum
CREATE TYPE "UnitConfigurationStatus" AS ENUM ('DRAFT', 'CURRENT', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "InventoryUnitStockBehavior" AS ENUM ('CANONICAL_SHARED', 'ALTERNATE_TRANSACTION', 'PACKAGED_STOCK');

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "CatalogItemKind" NOT NULL,
    "status" "CatalogRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "imageUrl" TEXT,
    "imageLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "currentUnitConfigurationVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogService" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantOptionGroup" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantOptionValue" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellableVariant" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CatalogRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SellableVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellableVariantSelection" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellableVariantSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellableOffering" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "SellableOfferingKind" NOT NULL,
    "status" "CatalogRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "pricingPolicy" "OfferingPricingPolicy" NOT NULL,
    "fixedPriceMinor" INTEGER,
    "currencyCode" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SellableOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnitOffering" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "inventoryUnitId" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUnitOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOffering" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitConfigurationVersion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "UnitConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "canonicalBalanceScale" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "UnitConfigurationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUnit" (
    "id" TEXT NOT NULL,
    "configurationVersionId" TEXT NOT NULL,
    "unitDefinitionId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "factor" DECIMAL(38,12) NOT NULL,
    "transactionScale" INTEGER NOT NULL DEFAULT 0,
    "stockBehavior" "InventoryUnitStockBehavior" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreOfferingAvailability" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreOfferingAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogPriceChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "previousPriceMinor" INTEGER,
    "priceMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "reason" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogItem_tenantId_kind_status_idx" ON "CatalogItem"("tenantId", "kind", "status");

-- CreateIndex
CREATE INDEX "CatalogItem_tenantId_updatedAt_idx" ON "CatalogItem"("tenantId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_tenantId_slug_key" ON "CatalogItem"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_catalogItemId_key" ON "CatalogProduct"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_currentUnitConfigurationVersionId_key" ON "CatalogProduct"("currentUnitConfigurationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogService_catalogItemId_key" ON "CatalogService"("catalogItemId");

-- CreateIndex
CREATE INDEX "VariantOptionGroup_catalogItemId_sortOrder_idx" ON "VariantOptionGroup"("catalogItemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VariantOptionGroup_catalogItemId_key_key" ON "VariantOptionGroup"("catalogItemId", "key");

-- CreateIndex
CREATE INDEX "VariantOptionValue_groupId_sortOrder_idx" ON "VariantOptionValue"("groupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VariantOptionValue_groupId_key_key" ON "VariantOptionValue"("groupId", "key");

-- CreateIndex
CREATE INDEX "SellableVariant_catalogItemId_status_sortOrder_idx" ON "SellableVariant"("catalogItemId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "SellableVariant_catalogItemId_isDefault_idx" ON "SellableVariant"("catalogItemId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "SellableVariant_catalogItemId_key_key" ON "SellableVariant"("catalogItemId", "key");

-- CreateIndex
CREATE INDEX "SellableVariantSelection_groupId_valueId_idx" ON "SellableVariantSelection"("groupId", "valueId");

-- CreateIndex
CREATE UNIQUE INDEX "SellableVariantSelection_variantId_groupId_key" ON "SellableVariantSelection"("variantId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "SellableVariantSelection_variantId_valueId_key" ON "SellableVariantSelection"("variantId", "valueId");

-- CreateIndex
CREATE INDEX "SellableOffering_tenantId_status_updatedAt_idx" ON "SellableOffering"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "SellableOffering_variantId_status_sortOrder_idx" ON "SellableOffering"("variantId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SellableOffering_catalogItemId_key_key" ON "SellableOffering"("catalogItemId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnitOffering_offeringId_key" ON "ProductUnitOffering"("offeringId");

-- CreateIndex
CREATE INDEX "ProductUnitOffering_inventoryUnitId_idx" ON "ProductUnitOffering"("inventoryUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnitOffering_tenantId_sku_key" ON "ProductUnitOffering"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnitOffering_tenantId_barcode_key" ON "ProductUnitOffering"("tenantId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOffering_offeringId_key" ON "ServiceOffering"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitDefinition_scopeKey_key" ON "UnitDefinition"("scopeKey");

-- CreateIndex
CREATE INDEX "UnitDefinition_tenantId_isActive_sortOrder_idx" ON "UnitDefinition"("tenantId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "UnitDefinition_isSystem_isActive_sortOrder_idx" ON "UnitDefinition"("isSystem", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "UnitConfigurationVersion_productId_status_idx" ON "UnitConfigurationVersion"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UnitConfigurationVersion_productId_version_key" ON "UnitConfigurationVersion"("productId", "version");

-- CreateIndex
CREATE INDEX "InventoryUnit_configurationVersionId_stockBehavior_sortOrde_idx" ON "InventoryUnit"("configurationVersionId", "stockBehavior", "sortOrder");

-- CreateIndex
CREATE INDEX "InventoryUnit_unitDefinitionId_idx" ON "InventoryUnit"("unitDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUnit_configurationVersionId_key_key" ON "InventoryUnit"("configurationVersionId", "key");

-- CreateIndex
CREATE INDEX "StoreOfferingAvailability_storeId_isAvailable_idx" ON "StoreOfferingAvailability"("storeId", "isAvailable");

-- CreateIndex
CREATE INDEX "StoreOfferingAvailability_offeringId_isAvailable_idx" ON "StoreOfferingAvailability"("offeringId", "isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "StoreOfferingAvailability_storeId_offeringId_key" ON "StoreOfferingAvailability"("storeId", "offeringId");

-- CreateIndex
CREATE INDEX "CatalogPriceChange_tenantId_effectiveAt_idx" ON "CatalogPriceChange"("tenantId", "effectiveAt");

-- CreateIndex
CREATE INDEX "CatalogPriceChange_offeringId_effectiveAt_idx" ON "CatalogPriceChange"("offeringId", "effectiveAt");

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_currentUnitConfigurationVersionId_fkey" FOREIGN KEY ("currentUnitConfigurationVersionId") REFERENCES "UnitConfigurationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogService" ADD CONSTRAINT "CatalogService_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantOptionGroup" ADD CONSTRAINT "VariantOptionGroup_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantOptionValue" ADD CONSTRAINT "VariantOptionValue_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "VariantOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellableVariant" ADD CONSTRAINT "SellableVariant_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellableVariantSelection" ADD CONSTRAINT "SellableVariantSelection_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "SellableVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellableVariantSelection" ADD CONSTRAINT "SellableVariantSelection_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "VariantOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellableVariantSelection" ADD CONSTRAINT "SellableVariantSelection_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "VariantOptionValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellableOffering" ADD CONSTRAINT "SellableOffering_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellableOffering" ADD CONSTRAINT "SellableOffering_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellableOffering" ADD CONSTRAINT "SellableOffering_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "SellableVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitOffering" ADD CONSTRAINT "ProductUnitOffering_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitOffering" ADD CONSTRAINT "ProductUnitOffering_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitOffering" ADD CONSTRAINT "ProductUnitOffering_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitDefinition" ADD CONSTRAINT "UnitDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitConfigurationVersion" ADD CONSTRAINT "UnitConfigurationVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "UnitConfigurationVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_unitDefinitionId_fkey" FOREIGN KEY ("unitDefinitionId") REFERENCES "UnitDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreOfferingAvailability" ADD CONSTRAINT "StoreOfferingAvailability_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreOfferingAvailability" ADD CONSTRAINT "StoreOfferingAvailability_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPriceChange" ADD CONSTRAINT "CatalogPriceChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPriceChange" ADD CONSTRAINT "CatalogPriceChange_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
