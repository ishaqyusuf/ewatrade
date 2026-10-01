-- AlterTable
ALTER TABLE "AccountPrivacyAccessRevocation" ADD COLUMN     "claimedByUserId" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT;
