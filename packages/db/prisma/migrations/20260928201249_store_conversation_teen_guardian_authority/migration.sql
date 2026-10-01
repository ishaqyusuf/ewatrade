-- CreateEnum
CREATE TYPE "AccountAgeBand" AS ENUM ('UNDECLARED', 'AGE_13_TO_15', 'AGE_16_TO_17', 'ADULT');

-- CreateEnum
CREATE TYPE "GuardianApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REVOKED');

-- AlterTable
ALTER TABLE "StoreConversationGuestIdentity" ADD COLUMN     "ageBand" "AccountAgeBand" NOT NULL DEFAULT 'UNDECLARED',
ADD COLUMN     "ageDeclaredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ageBand" "AccountAgeBand" NOT NULL DEFAULT 'UNDECLARED',
ADD COLUMN     "ageDeclaredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StoreConversationAccountGuardianApproval" (
    "id" TEXT NOT NULL,
    "teenUserId" TEXT NOT NULL,
    "guardianUserId" TEXT NOT NULL,
    "status" "GuardianApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "noticeVersion" TEXT,
    "noticeDocumentHash" TEXT,
    "approvedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationAccountGuardianApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationGuestGuardianApproval" (
    "id" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "guardianUserId" TEXT NOT NULL,
    "status" "GuardianApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "noticeVersion" TEXT,
    "noticeDocumentHash" TEXT,
    "approvedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationGuestGuardianApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAccountGuardianApproval_teenUserId_key" ON "StoreConversationAccountGuardianApproval"("teenUserId");

-- CreateIndex
CREATE INDEX "StoreConversationAccountGuardianApproval_guardianUserId_sta_idx" ON "StoreConversationAccountGuardianApproval"("guardianUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestGuardianApproval_guestIdentityId_key" ON "StoreConversationGuestGuardianApproval"("guestIdentityId");

-- CreateIndex
CREATE INDEX "StoreConversationGuestGuardianApproval_guardianUserId_statu_idx" ON "StoreConversationGuestGuardianApproval"("guardianUserId", "status");

-- AddForeignKey
ALTER TABLE "StoreConversationAccountGuardianApproval" ADD CONSTRAINT "StoreConversationAccountGuardianApproval_teenUserId_fkey" FOREIGN KEY ("teenUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountGuardianApproval" ADD CONSTRAINT "StoreConversationAccountGuardianApproval_guardianUserId_fkey" FOREIGN KEY ("guardianUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestGuardianApproval" ADD CONSTRAINT "StoreConversationGuestGuardianApproval_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestGuardianApproval" ADD CONSTRAINT "StoreConversationGuestGuardianApproval_guardianUserId_fkey" FOREIGN KEY ("guardianUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
