-- CreateEnum
CREATE TYPE "AccountPrivacyAccessRevocationStatus" AS ENUM ('PENDING', 'PROCESSING', 'REVOKED', 'FAILED');

-- CreateTable
CREATE TABLE "AccountPrivacyAccessRevocation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AccountPrivacyAccessRevocationStatus" NOT NULL DEFAULT 'PENDING',
    "claimId" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sessionsRevokedAt" TIMESTAMP(3),
    "appleRevokedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPrivacyAccessRevocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyAccessRevocation_requestId_key" ON "AccountPrivacyAccessRevocation"("requestId");

-- CreateIndex
CREATE INDEX "AccountPrivacyAccessRevocation_status_claimExpiresAt_idx" ON "AccountPrivacyAccessRevocation"("status", "claimExpiresAt");

-- CreateIndex
CREATE INDEX "AccountPrivacyAccessRevocation_userId_idx" ON "AccountPrivacyAccessRevocation"("userId");

-- AddForeignKey
ALTER TABLE "AccountPrivacyAccessRevocation" ADD CONSTRAINT "AccountPrivacyAccessRevocation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AccountPrivacyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
