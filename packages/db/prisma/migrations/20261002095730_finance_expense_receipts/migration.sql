-- CreateEnum
CREATE TYPE "FinanceExpenseReceiptUploadState" AS ENUM ('PENDING', 'CLAIMED', 'VERIFIED', 'RETRYABLE', 'CLEANUP_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "FinanceExpenseReceiptSafetyState" AS ENUM ('QUARANTINED', 'SAFE', 'REJECTED');

-- CreateEnum
CREATE TYPE "FinanceExpenseReceiptAttachmentState" AS ENUM ('UNATTACHED', 'ATTACHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FinanceExpenseReceiptAuditKind" AS ENUM ('INTENT_CREATED', 'UPLOAD_CLAIMED', 'UPLOAD_VERIFIED', 'UPLOAD_RETRYABLE', 'SAFETY_REVIEWED', 'ATTACHED', 'WITHDRAWN', 'DOWNLOAD_GRANTED', 'DOWNLOAD_CONSUMED', 'RETENTION_CHANGED', 'CLEANUP_CLAIMED', 'BYTES_DELETED');

-- CreateTable
CREATE TABLE "FinanceExpenseReceiptAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'vercel_blob_private',
    "storagePath" TEXT NOT NULL,
    "storageStoreId" TEXT,
    "uploadState" "FinanceExpenseReceiptUploadState" NOT NULL DEFAULT 'PENDING',
    "safetyState" "FinanceExpenseReceiptSafetyState" NOT NULL DEFAULT 'QUARANTINED',
    "attachmentState" "FinanceExpenseReceiptAttachmentState" NOT NULL DEFAULT 'UNATTACHED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "uploadClaimId" TEXT,
    "uploadClaimedAt" TIMESTAMP(3),
    "uploadLeaseUntil" TIMESTAMP(3),
    "verifiedClaimId" TEXT,
    "verifiedClaimVersion" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "safetyAttestation" JSONB,
    "safetyReviewedAt" TIMESTAMP(3),
    "attachedAt" TIMESTAMP(3),
    "attachedById" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnById" TEXT,
    "retentionHold" BOOLEAN NOT NULL DEFAULT false,
    "retentionHoldReason" TEXT,
    "cleanupClaimId" TEXT,
    "cleanupLeaseUntil" TIMESTAMP(3),
    "bytesDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceExpenseReceiptAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpenseReceiptAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" "FinanceExpenseReceiptAuditKind" NOT NULL,
    "assetVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExpenseReceiptAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpenseReceiptDownloadGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "sessionDigest" TEXT NOT NULL,
    "nonceDigest" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceExpenseReceiptDownloadGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceExpenseReceiptAsset_bookId_billId_createdAt_id_idx" ON "FinanceExpenseReceiptAsset"("bookId", "billId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "FinanceExpenseReceiptAsset_bookId_actorUserId_expiresAt_idx" ON "FinanceExpenseReceiptAsset"("bookId", "actorUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "FinanceExpenseReceiptAsset_uploadState_expiresAt_idx" ON "FinanceExpenseReceiptAsset"("uploadState", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseReceiptAsset_tenantId_bookId_billId_id_key" ON "FinanceExpenseReceiptAsset"("tenantId", "bookId", "billId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseReceiptAsset_tenantId_storageProvider_storage_key" ON "FinanceExpenseReceiptAsset"("tenantId", "storageProvider", "storagePath");

-- CreateIndex
CREATE INDEX "FinanceExpenseReceiptAuditEvent_tenantId_bookId_billId_asse_idx" ON "FinanceExpenseReceiptAuditEvent"("tenantId", "bookId", "billId", "assetId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseReceiptDownloadGrant_nonceDigest_key" ON "FinanceExpenseReceiptDownloadGrant"("nonceDigest");

-- CreateIndex
CREATE INDEX "FinanceExpenseReceiptDownloadGrant_tenantId_actorUserId_exp_idx" ON "FinanceExpenseReceiptDownloadGrant"("tenantId", "actorUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "FinanceExpenseReceiptDownloadGrant_assetId_expiresAt_idx" ON "FinanceExpenseReceiptDownloadGrant"("assetId", "expiresAt");

-- AddForeignKey
ALTER TABLE "FinanceExpenseReceiptAsset" ADD CONSTRAINT "FinanceExpenseReceiptAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseReceiptAsset" ADD CONSTRAINT "FinanceExpenseReceiptAsset_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseReceiptAsset" ADD CONSTRAINT "FinanceExpenseReceiptAsset_bookId_billId_fkey" FOREIGN KEY ("bookId", "billId") REFERENCES "FinanceBill"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseReceiptAuditEvent" ADD CONSTRAINT "FinanceExpenseReceiptAuditEvent_tenantId_bookId_billId_ass_fkey" FOREIGN KEY ("tenantId", "bookId", "billId", "assetId") REFERENCES "FinanceExpenseReceiptAsset"("tenantId", "bookId", "billId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseReceiptDownloadGrant" ADD CONSTRAINT "FinanceExpenseReceiptDownloadGrant_tenantId_bookId_billId__fkey" FOREIGN KEY ("tenantId", "bookId", "billId", "assetId") REFERENCES "FinanceExpenseReceiptAsset"("tenantId", "bookId", "billId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
