-- AlterTable
ALTER TABLE "CatalogPhotoAsset" ADD COLUMN     "reviewAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewAvailableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reviewLeaseToken" TEXT,
ADD COLUMN     "reviewLeaseUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CatalogPhotoAsset_state_reviewAvailableAt_reviewLeaseUntil_idx" ON "CatalogPhotoAsset"("state", "reviewAvailableAt", "reviewLeaseUntil");
