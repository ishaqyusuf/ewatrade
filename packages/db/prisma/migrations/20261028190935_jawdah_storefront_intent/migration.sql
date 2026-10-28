-- AlterTable
ALTER TABLE "StorefrontMerchantAlert" ADD COLUMN     "readByUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "StorefrontOrderRequest" ADD COLUMN     "requestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StorefrontOrderRequestLine" ADD COLUMN     "preorder" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CatalogStorefrontPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "unavailable" BOOLEAN NOT NULL DEFAULT false,
    "allowBookAhead" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogStorefrontPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogStorefrontPolicy_tenantId_storeId_catalogItemId_key" ON "CatalogStorefrontPolicy"("tenantId", "storeId", "catalogItemId");

-- AddForeignKey
ALTER TABLE "CatalogStorefrontPolicy" ADD CONSTRAINT "CatalogStorefrontPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogStorefrontPolicy" ADD CONSTRAINT "CatalogStorefrontPolicy_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "Store"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogStorefrontPolicy" ADD CONSTRAINT "CatalogStorefrontPolicy_tenantId_catalogItemId_fkey" FOREIGN KEY ("tenantId", "catalogItemId") REFERENCES "CatalogItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
