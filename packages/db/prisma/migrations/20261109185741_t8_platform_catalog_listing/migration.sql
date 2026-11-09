-- AlterTable
ALTER TABLE "CatalogStorefrontPolicy" ADD COLUMN     "platformListed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "publicCatalogListedAt" TIMESTAMP(3);
