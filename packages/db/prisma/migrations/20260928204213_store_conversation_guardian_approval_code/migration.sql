-- AlterTable
ALTER TABLE "StoreConversationAccountGuardianApproval" ADD COLUMN     "requestExpiresAt" TIMESTAMP(3),
ADD COLUMN     "requestTokenDigest" TEXT,
ALTER COLUMN "guardianUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StoreConversationGuestGuardianApproval" ADD COLUMN     "requestExpiresAt" TIMESTAMP(3),
ADD COLUMN     "requestTokenDigest" TEXT,
ALTER COLUMN "guardianUserId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "StoreConversationAccountGuardianApproval_requestTokenDigest_idx" ON "StoreConversationAccountGuardianApproval"("requestTokenDigest");

-- CreateIndex
CREATE INDEX "StoreConversationGuestGuardianApproval_requestTokenDigest_idx" ON "StoreConversationGuestGuardianApproval"("requestTokenDigest");
