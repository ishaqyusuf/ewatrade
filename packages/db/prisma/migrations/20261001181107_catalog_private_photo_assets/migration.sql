/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,id]` on the table `CatalogItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,id]` on the table `Store` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CatalogPhotoAssetState" AS ENUM ('UPLOADING', 'PENDING_REVIEW', 'REJECTED', 'REMOVED');

-- CreateTable
CREATE TABLE "CatalogPhotoAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "state" "CatalogPhotoAssetState" NOT NULL DEFAULT 'UPLOADING',
    "storageProvider" TEXT NOT NULL DEFAULT 'vercel_blob_private',
    "storagePath" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "catalogItemId" TEXT,
    "sortOrder" INTEGER,
    "attachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogPhotoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogPhotoAsset_tenantId_storeId_actorUserId_expiresAt_idx" ON "CatalogPhotoAsset"("tenantId", "storeId", "actorUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "CatalogPhotoAsset_tenantId_catalogItemId_state_idx" ON "CatalogPhotoAsset"("tenantId", "catalogItemId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPhotoAsset_tenantId_clientOperationId_key" ON "CatalogPhotoAsset"("tenantId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPhotoAsset_tenantId_storagePath_key" ON "CatalogPhotoAsset"("tenantId", "storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPhotoAsset_catalogItemId_sortOrder_key" ON "CatalogPhotoAsset"("catalogItemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_tenantId_id_key" ON "CatalogItem"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Store_tenantId_id_key" ON "Store"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "CatalogPhotoAsset" ADD CONSTRAINT "CatalogPhotoAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPhotoAsset" ADD CONSTRAINT "CatalogPhotoAsset_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "Store"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPhotoAsset" ADD CONSTRAINT "CatalogPhotoAsset_tenantId_catalogItemId_fkey" FOREIGN KEY ("tenantId", "catalogItemId") REFERENCES "CatalogItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
