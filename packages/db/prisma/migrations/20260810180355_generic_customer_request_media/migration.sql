/*
  Warnings:

  - A unique constraint covering the columns `[verifiedObservationId]` on the table `CatalogSourceLineLink` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mediaAssetId]` on the table `PrescriptionMedia` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ServiceCommerceMediaKind" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "ServiceCommerceMediaChannelOrigin" AS ENUM ('WEB', 'STAFF', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ServiceCommerceMediaLifecycle" AS ENUM ('PENDING_UPLOAD', 'PENDING_RETRIEVAL', 'STORED', 'SAFETY_PENDING', 'SAFE', 'QUARANTINED', 'REJECTED', 'RETRYABLE', 'RETENTION_HOLD', 'DELETED');

-- CreateEnum
CREATE TYPE "ServiceCommerceMediaRetentionClass" AS ENUM ('ORDINARY_COMMERCE', 'CLINICAL_EXTENSION');

-- CreateEnum
CREATE TYPE "ServiceCommerceSourceAttachmentLifecycle" AS ENUM ('ACTIVE', 'REPLACED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ServiceCommerceVerifiedObservationLifecycle" AS ENUM ('CURRENT', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ServiceCommerceMediaAuditEventType" AS ENUM ('REFERENCE_RECORDED', 'UPLOAD_STORED', 'RETRIEVAL_ATTEMPTED', 'RETRY_SCHEDULED', 'SAFETY_REQUESTED', 'SAFETY_RECORDED', 'VIEW_AUTHORIZED', 'ATTACHMENT_REPLACED', 'ATTACHMENT_REMOVED', 'OBSERVATION_VERIFIED', 'OBSERVATION_SUPERSEDED', 'OBSERVATION_WITHDRAWN', 'RETENTION_HELD', 'DELETED');

-- AlterEnum
ALTER TYPE "ServiceCommercePolicySubject" ADD VALUE 'ATTACHMENTS';

-- AlterTable
ALTER TABLE "CatalogSourceLineLink" ADD COLUMN     "verifiedObservationId" TEXT;

-- AlterTable
ALTER TABLE "PrescriptionMedia" ADD COLUMN     "mediaAssetId" TEXT;

-- AlterTable
ALTER TABLE "ServiceCommerceStoreProfile" ADD COLUMN     "attachmentsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attachmentsProviderReady" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WhatsAppInboundEvent" ADD COLUMN     "routeVertical" "ServiceCommercePolicyVertical" NOT NULL DEFAULT 'PHARMACY';

-- CreateTable
CREATE TABLE "ServiceCommerceMediaAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" "ServiceCommerceMediaKind" NOT NULL,
    "channelOrigin" "ServiceCommerceMediaChannelOrigin" NOT NULL,
    "clientMediaId" TEXT NOT NULL,
    "provider" TEXT,
    "providerConnectionId" TEXT,
    "providerMediaId" TEXT,
    "originalFileName" TEXT NOT NULL,
    "declaredMediaType" TEXT NOT NULL,
    "verifiedMediaType" TEXT,
    "declaredSizeBytes" INTEGER,
    "verifiedSizeBytes" INTEGER,
    "contentDigest" TEXT,
    "objectKey" TEXT,
    "lifecycle" "ServiceCommerceMediaLifecycle" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "retentionClass" "ServiceCommerceMediaRetentionClass" NOT NULL DEFAULT 'ORDINARY_COMMERCE',
    "safetyProvider" TEXT,
    "safetyMetadata" JSONB,
    "retrievalAttempts" INTEGER NOT NULL DEFAULT 0,
    "safetyAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastFailureCode" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "storedAt" TIMESTAMP(3),
    "safetyResolvedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "retentionHoldAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCommerceMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceSourceAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "sourceKind" "CommerceQuoteSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "sourceLineId" TEXT,
    "lifecycle" "ServiceCommerceSourceAttachmentLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "attachedByUserId" TEXT,
    "replacedAt" TIMESTAMP(3),
    "replacedByMediaAssetId" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCommerceSourceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceVerifiedObservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "lifecycle" "ServiceCommerceVerifiedObservationLifecycle" NOT NULL DEFAULT 'CURRENT',
    "currentKey" TEXT,
    "displayLabel" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "sourceLineId" TEXT,
    "verifiedByUserId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceVerifiedObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceMediaAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "attachmentId" TEXT,
    "observationId" TEXT,
    "type" "ServiceCommerceMediaAuditEventType" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT NOT NULL,
    "lifecycle" "ServiceCommerceMediaLifecycle",
    "attempt" INTEGER,
    "metadata" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceMediaAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCommerceMediaAsset_tenantId_storeId_lifecycle_create_idx" ON "ServiceCommerceMediaAsset"("tenantId", "storeId", "lifecycle", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceMediaAsset_tenantId_storeId_providerConnecti_idx" ON "ServiceCommerceMediaAsset"("tenantId", "storeId", "providerConnectionId");

-- CreateIndex
CREATE INDEX "ServiceCommerceMediaAsset_lifecycle_nextRetryAt_idx" ON "ServiceCommerceMediaAsset"("lifecycle", "nextRetryAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceMediaAsset_retentionClass_retentionUntil_lif_idx" ON "ServiceCommerceMediaAsset"("retentionClass", "retentionUntil", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceMediaAsset_tenantId_channelOrigin_clientMedi_key" ON "ServiceCommerceMediaAsset"("tenantId", "channelOrigin", "clientMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceMediaAsset_tenantId_provider_providerMediaId_key" ON "ServiceCommerceMediaAsset"("tenantId", "provider", "providerMediaId");

-- CreateIndex
CREATE INDEX "ServiceCommerceSourceAttachment_tenantId_storeId_sourceKind_idx" ON "ServiceCommerceSourceAttachment"("tenantId", "storeId", "sourceKind", "sourceId", "lifecycle");

-- CreateIndex
CREATE INDEX "ServiceCommerceSourceAttachment_mediaAssetId_lifecycle_idx" ON "ServiceCommerceSourceAttachment"("mediaAssetId", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceSourceAttachment_tenantId_sourceKind_sourceI_key" ON "ServiceCommerceSourceAttachment"("tenantId", "sourceKind", "sourceId", "sourceVersion", "mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceVerifiedObservation_currentKey_key" ON "ServiceCommerceVerifiedObservation"("currentKey");

-- CreateIndex
CREATE INDEX "ServiceCommerceVerifiedObservation_tenantId_storeId_lifecyc_idx" ON "ServiceCommerceVerifiedObservation"("tenantId", "storeId", "lifecycle", "verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceVerifiedObservation_attachmentId_revision_key" ON "ServiceCommerceVerifiedObservation"("attachmentId", "revision");

-- CreateIndex
CREATE INDEX "ServiceCommerceMediaAuditEvent_tenantId_storeId_effectiveAt_idx" ON "ServiceCommerceMediaAuditEvent"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceMediaAuditEvent_mediaAssetId_effectiveAt_idx" ON "ServiceCommerceMediaAuditEvent"("mediaAssetId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceMediaAuditEvent_attachmentId_effectiveAt_idx" ON "ServiceCommerceMediaAuditEvent"("attachmentId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceMediaAuditEvent_observationId_effectiveAt_idx" ON "ServiceCommerceMediaAuditEvent"("observationId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSourceLineLink_verifiedObservationId_key" ON "CatalogSourceLineLink"("verifiedObservationId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionMedia_mediaAssetId_key" ON "PrescriptionMedia"("mediaAssetId");

-- AddForeignKey
ALTER TABLE "CatalogSourceLineLink" ADD CONSTRAINT "CatalogSourceLineLink_verifiedObservationId_fkey" FOREIGN KEY ("verifiedObservationId") REFERENCES "ServiceCommerceVerifiedObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionMedia" ADD CONSTRAINT "PrescriptionMedia_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "ServiceCommerceMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceMediaAsset" ADD CONSTRAINT "ServiceCommerceMediaAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceMediaAsset" ADD CONSTRAINT "ServiceCommerceMediaAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceSourceAttachment" ADD CONSTRAINT "ServiceCommerceSourceAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceSourceAttachment" ADD CONSTRAINT "ServiceCommerceSourceAttachment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceSourceAttachment" ADD CONSTRAINT "ServiceCommerceSourceAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "ServiceCommerceMediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceVerifiedObservation" ADD CONSTRAINT "ServiceCommerceVerifiedObservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceVerifiedObservation" ADD CONSTRAINT "ServiceCommerceVerifiedObservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceVerifiedObservation" ADD CONSTRAINT "ServiceCommerceVerifiedObservation_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ServiceCommerceSourceAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceMediaAuditEvent" ADD CONSTRAINT "ServiceCommerceMediaAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceMediaAuditEvent" ADD CONSTRAINT "ServiceCommerceMediaAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceMediaAuditEvent" ADD CONSTRAINT "ServiceCommerceMediaAuditEvent_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "ServiceCommerceMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceMediaAuditEvent" ADD CONSTRAINT "ServiceCommerceMediaAuditEvent_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ServiceCommerceSourceAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceMediaAuditEvent" ADD CONSTRAINT "ServiceCommerceMediaAuditEvent_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "ServiceCommerceVerifiedObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
