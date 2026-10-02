-- CreateTable
CREATE TABLE "CatalogItemIllustration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "illustrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItemIllustration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogItemIllustration_tenantId_storeId_idx" ON "CatalogItemIllustration"("tenantId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItemIllustration_tenantId_catalogItemId_storeId_key" ON "CatalogItemIllustration"("tenantId", "catalogItemId", "storeId");

-- AddForeignKey
ALTER TABLE "CatalogItemIllustration" ADD CONSTRAINT "CatalogItemIllustration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemIllustration" ADD CONSTRAINT "CatalogItemIllustration_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "Store"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemIllustration" ADD CONSTRAINT "CatalogItemIllustration_tenantId_catalogItemId_fkey" FOREIGN KEY ("tenantId", "catalogItemId") REFERENCES "CatalogItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
