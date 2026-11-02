-- AlterTable
ALTER TABLE "CatalogPhotoAsset" ADD COLUMN     "galleryAddedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CatalogGalleryImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "title" TEXT,
    "category" TEXT,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogGalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogGalleryImage_tenantId_category_idx" ON "CatalogGalleryImage"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogGalleryImage_tenantId_contentDigest_key" ON "CatalogGalleryImage"("tenantId", "contentDigest");

-- CreateIndex
CREATE INDEX "CatalogPhotoAsset_tenantId_storeId_galleryAddedAt_idx" ON "CatalogPhotoAsset"("tenantId", "storeId", "galleryAddedAt");

-- AddForeignKey
ALTER TABLE "CatalogGalleryImage" ADD CONSTRAINT "CatalogGalleryImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
