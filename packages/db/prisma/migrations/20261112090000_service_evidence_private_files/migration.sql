-- AlterTable
ALTER TABLE "ServiceEvidence" ADD COLUMN     "contentDigest" TEXT,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "storagePath" TEXT,
ADD COLUMN     "storageProvider" TEXT,
ADD COLUMN     "storageStoreId" TEXT;
