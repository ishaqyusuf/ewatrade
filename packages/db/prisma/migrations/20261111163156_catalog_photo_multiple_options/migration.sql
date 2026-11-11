-- CreateTable
CREATE TABLE "CatalogPhotoOption" (
    "assetId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "CatalogPhotoOption_pkey" PRIMARY KEY ("assetId","variantId")
);

-- CreateIndex
CREATE INDEX "CatalogPhotoOption_variantId_idx" ON "CatalogPhotoOption"("variantId");

-- AddForeignKey
ALTER TABLE "CatalogPhotoOption" ADD CONSTRAINT "CatalogPhotoOption_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CatalogPhotoAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPhotoOption" ADD CONSTRAINT "CatalogPhotoOption_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "SellableVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
