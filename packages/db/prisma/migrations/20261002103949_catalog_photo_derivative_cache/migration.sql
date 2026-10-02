-- CreateTable
CREATE TABLE "CatalogPhotoDerivative" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceDigest" TEXT NOT NULL,
    "processingVersion" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "displayDigest" TEXT NOT NULL,
    "storageStoreId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "dataClassification" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'catalog-derivative-v1',
    "readyAt" TIMESTAMP(3),
    "writeUntil" TIMESTAMP(3) NOT NULL,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPhotoDerivative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogPhotoDerivative_tenantId_assetId_idx" ON "CatalogPhotoDerivative"("tenantId", "assetId");

-- CreateIndex
CREATE INDEX "CatalogPhotoDerivative_availableAt_leaseUntil_idx" ON "CatalogPhotoDerivative"("availableAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPhotoDerivative_storageStoreId_storagePath_key" ON "CatalogPhotoDerivative"("storageStoreId", "storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPhotoDerivative_assetId_sourceDigest_processingVersi_key" ON "CatalogPhotoDerivative"("assetId", "sourceDigest", "processingVersion", "variant");
