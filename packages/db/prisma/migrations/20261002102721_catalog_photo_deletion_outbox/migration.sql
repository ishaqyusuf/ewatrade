-- DropForeignKey
ALTER TABLE "CatalogPhotoAsset" DROP CONSTRAINT "CatalogPhotoAsset_tenantId_fkey";

-- AlterTable
ALTER TABLE "CatalogPhotoAsset" ADD COLUMN     "storageStoreId" TEXT;

-- CreateTable
CREATE TABLE "CatalogPhotoDeletionOutbox" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageStoreId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "dataClassification" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPhotoDeletionOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPhotoDeletionOutbox_assetId_key" ON "CatalogPhotoDeletionOutbox"("assetId");

-- CreateIndex
CREATE INDEX "CatalogPhotoDeletionOutbox_completedAt_availableAt_leaseUnt_idx" ON "CatalogPhotoDeletionOutbox"("completedAt", "availableAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPhotoDeletionOutbox_storageStoreId_storagePath_key" ON "CatalogPhotoDeletionOutbox"("storageStoreId", "storagePath");

-- AddForeignKey
ALTER TABLE "CatalogPhotoAsset" ADD CONSTRAINT "CatalogPhotoAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
