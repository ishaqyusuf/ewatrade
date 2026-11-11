-- AlterTable
ALTER TABLE "CatalogPhotoAsset" ADD COLUMN     "optionVariantId" TEXT;

-- CreateIndex
CREATE INDEX "CatalogPhotoAsset_optionVariantId_idx" ON "CatalogPhotoAsset"("optionVariantId");

-- AddForeignKey
ALTER TABLE "CatalogPhotoAsset" ADD CONSTRAINT "CatalogPhotoAsset_optionVariantId_fkey" FOREIGN KEY ("optionVariantId") REFERENCES "SellableVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
