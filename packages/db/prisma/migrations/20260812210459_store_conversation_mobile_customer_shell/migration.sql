-- CreateEnum
CREATE TYPE "StoreConversationGuestAccessOrigin" AS ENUM ('OWNER', 'MOBILE_BOOTSTRAP', 'TRANSFER');

-- CreateEnum
CREATE TYPE "StoreConversationGuestAccessStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "StoreConversationTransferStatus" AS ENUM ('PENDING', 'CLAIMED', 'REDEEMED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'TRANSFER_CREATED';
ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'TRANSFER_CLAIMED';
ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'TRANSFER_REDEEMED';

-- AlterTable
ALTER TABLE "StoreConversationGuestCredential" ADD COLUMN     "deviceBindingDigest" TEXT;

-- CreateTable
CREATE TABLE "StoreConversationGuestAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "origin" "StoreConversationGuestAccessOrigin" NOT NULL,
    "status" "StoreConversationGuestAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationGuestAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sourceCredentialId" TEXT NOT NULL,
    "redeemedGuestIdentityId" TEXT,
    "redeemedCredentialId" TEXT,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "claimedInstallationDigest" TEXT,
    "status" "StoreConversationTransferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreConversationGuestAccess_guestIdentityId_status_lastOpe_idx" ON "StoreConversationGuestAccess"("guestIdentityId", "status", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "StoreConversationGuestAccess_tenantId_storeId_status_idx" ON "StoreConversationGuestAccess"("tenantId", "storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestAccess_conversationId_guestIdentityId_key" ON "StoreConversationGuestAccess"("conversationId", "guestIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationTransfer_tokenDigest_key" ON "StoreConversationTransfer"("tokenDigest");

-- CreateIndex
CREATE INDEX "StoreConversationTransfer_status_expiresAt_idx" ON "StoreConversationTransfer"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversationTransfer_conversationId_status_idx" ON "StoreConversationTransfer"("conversationId", "status");

-- CreateIndex
CREATE INDEX "StoreConversationTransfer_claimedInstallationDigest_status_idx" ON "StoreConversationTransfer"("claimedInstallationDigest", "status");

-- CreateIndex
CREATE INDEX "StoreConversationTransfer_tenantId_storeId_status_idx" ON "StoreConversationTransfer"("tenantId", "storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationTransfer_sourceCredentialId_clientOperatio_key" ON "StoreConversationTransfer"("sourceCredentialId", "clientOperationId");

-- CreateIndex
CREATE INDEX "StoreConversationGuestCredential_purpose_deviceBindingDiges_idx" ON "StoreConversationGuestCredential"("purpose", "deviceBindingDigest", "status");

-- AddForeignKey
ALTER TABLE "StoreConversationGuestAccess" ADD CONSTRAINT "StoreConversationGuestAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestAccess" ADD CONSTRAINT "StoreConversationGuestAccess_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestAccess" ADD CONSTRAINT "StoreConversationGuestAccess_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationGuestAccess" ADD CONSTRAINT "StoreConversationGuestAccess_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationTransfer" ADD CONSTRAINT "StoreConversationTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationTransfer" ADD CONSTRAINT "StoreConversationTransfer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationTransfer" ADD CONSTRAINT "StoreConversationTransfer_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationTransfer" ADD CONSTRAINT "StoreConversationTransfer_sourceCredentialId_fkey" FOREIGN KEY ("sourceCredentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationTransfer" ADD CONSTRAINT "StoreConversationTransfer_redeemedGuestIdentityId_fkey" FOREIGN KEY ("redeemedGuestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationTransfer" ADD CONSTRAINT "StoreConversationTransfer_redeemedCredentialId_fkey" FOREIGN KEY ("redeemedCredentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
