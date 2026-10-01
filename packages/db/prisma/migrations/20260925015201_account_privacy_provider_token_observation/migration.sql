-- AlterTable
ALTER TABLE "AccountPrivacyAccessRecoveryEvent" ADD COLUMN     "otherProviderTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "storedIdentityTokens" INTEGER NOT NULL DEFAULT 0;
