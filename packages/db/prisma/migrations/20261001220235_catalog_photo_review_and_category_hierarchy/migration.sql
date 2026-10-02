-- AlterEnum
ALTER TYPE "CatalogPhotoAssetState" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "subcategoryId" TEXT;

-- AlterTable
ALTER TABLE "CatalogPhotoAsset" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "bytesDeletedAt" TIMESTAMP(3),
ADD COLUMN     "reviewDisplayDigest" TEXT,
ADD COLUMN     "reviewPolicyVersion" TEXT,
ADD COLUMN     "reviewProvider" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CatalogCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogCategory_tenantId_parentId_normalizedLabel_idx" ON "CatalogCategory"("tenantId", "parentId", "normalizedLabel");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCategory_tenantId_id_key" ON "CatalogCategory"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCategory_tenantId_key_key" ON "CatalogCategory"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "CatalogCategory" ADD CONSTRAINT "CatalogCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogCategory" ADD CONSTRAINT "CatalogCategory_tenantId_parentId_fkey" FOREIGN KEY ("tenantId", "parentId") REFERENCES "CatalogCategory"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_tenantId_categoryId_fkey" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "CatalogCategory"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_tenantId_subcategoryId_fkey" FOREIGN KEY ("tenantId", "subcategoryId") REFERENCES "CatalogCategory"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
