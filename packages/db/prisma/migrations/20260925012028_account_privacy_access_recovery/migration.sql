-- CreateTable
CREATE TABLE "AccountPrivacyAccessRecoveryEvent" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operatorUserId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "activeSessions" INTEGER NOT NULL,
    "appleAuthorizations" INTEGER NOT NULL,
    "activePushEndpoints" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountPrivacyAccessRecoveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyAccessRecoveryEvent_claimId_key" ON "AccountPrivacyAccessRecoveryEvent"("claimId");

-- CreateIndex
CREATE INDEX "AccountPrivacyAccessRecoveryEvent_requestId_claimedAt_idx" ON "AccountPrivacyAccessRecoveryEvent"("requestId", "claimedAt");

-- CreateIndex
CREATE INDEX "AccountPrivacyAccessRecoveryEvent_userId_claimedAt_idx" ON "AccountPrivacyAccessRecoveryEvent"("userId", "claimedAt");

-- AddForeignKey
ALTER TABLE "AccountPrivacyAccessRecoveryEvent" ADD CONSTRAINT "AccountPrivacyAccessRecoveryEvent_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "AccountPrivacyAccessRevocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
