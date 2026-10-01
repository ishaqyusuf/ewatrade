-- AlterTable
ALTER TABLE "AccountPrivacyRequest" ADD COLUMN     "contactEmail" TEXT;

-- CreateTable
CREATE TABLE "AccountPrivacyChallenge" (
    "id" TEXT NOT NULL,
    "emailDigest" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "codeDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 1,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPrivacyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyChallenge_emailDigest_key" ON "AccountPrivacyChallenge"("emailDigest");

-- CreateIndex
CREATE INDEX "AccountPrivacyChallenge_expiresAt_idx" ON "AccountPrivacyChallenge"("expiresAt");
