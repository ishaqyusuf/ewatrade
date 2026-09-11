-- AlterEnum
ALTER TYPE "ServiceCommerceMediaKind" ADD VALUE 'AUDIO';

-- AlterTable
ALTER TABLE "ServiceCommerceMediaAsset" ADD COLUMN     "verifiedDurationMs" INTEGER;
