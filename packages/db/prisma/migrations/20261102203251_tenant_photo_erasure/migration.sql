-- CreateEnum
CREATE TYPE "TenantPhotoErasureRunStatus" AS ENUM ('INVENTORYING', 'DELETING', 'VERIFYING', 'NEEDS_REVIEW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TenantPhotoErasureObjectKind" AS ENUM ('CATALOG_ORIGINAL', 'CATALOG_DERIVATIVE', 'EXPENSE_RECEIPT', 'ORDER_ATTACHMENT', 'ASSISTANT_ATTACHMENT', 'SERVICE_MEDIA', 'PRESCRIPTION_MEDIA');

-- CreateEnum
CREATE TYPE "TenantPhotoErasureObjectState" AS ENUM ('PENDING', 'DELETED', 'FAILED', 'HELD');

-- CreateEnum
CREATE TYPE "TenantPhotoErasureHoldReason" AS ENUM ('FINANCIAL_EVIDENCE_POLICY_PENDING', 'RETENTION_HOLD', 'CLINICAL_RETENTION', 'OWNERSHIP_UNKNOWN', 'PROVIDER_UNSUPPORTED');

-- CreateTable
CREATE TABLE "TenantPhotoErasureRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataClassification" TEXT NOT NULL,
    "authorityReference" TEXT NOT NULL,
    "startedByUserId" TEXT NOT NULL,
    "status" "TenantPhotoErasureRunStatus" NOT NULL DEFAULT 'INVENTORYING',
    "inventoryCursor" JSONB NOT NULL DEFAULT '{}',
    "passAdded" INTEGER NOT NULL DEFAULT 0,
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "inventoriedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPhotoErasureRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPhotoErasureObject" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "TenantPhotoErasureObjectKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "storageProvider" TEXT,
    "storageStoreId" TEXT,
    "storagePath" TEXT,
    "contentDigest" TEXT,
    "sizeBytes" INTEGER,
    "state" "TenantPhotoErasureObjectState" NOT NULL,
    "holdReason" "TenantPhotoErasureHoldReason",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPhotoErasureObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantPhotoErasureRun_tenantId_key" ON "TenantPhotoErasureRun"("tenantId");

-- CreateIndex
CREATE INDEX "TenantPhotoErasureRun_status_updatedAt_idx" ON "TenantPhotoErasureRun"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TenantPhotoErasureObject_state_nextAttemptAt_leaseUntil_idx" ON "TenantPhotoErasureObject"("state", "nextAttemptAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "TenantPhotoErasureObject_runId_state_idx" ON "TenantPhotoErasureObject"("runId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "TenantPhotoErasureObject_runId_kind_sourceId_key" ON "TenantPhotoErasureObject"("runId", "kind", "sourceId");

-- AddForeignKey
ALTER TABLE "TenantPhotoErasureObject" ADD CONSTRAINT "TenantPhotoErasureObject_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TenantPhotoErasureRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
