-- CreateEnum
CREATE TYPE "ServiceCommerceReportReadKind" AS ENUM ('REPORT', 'DRILLDOWN');

-- CreateEnum
CREATE TYPE "ServiceCommerceReportReadOutcome" AS ENUM ('ALLOWED', 'DENIED');

-- CreateEnum
CREATE TYPE "ServiceCommerceReportDrilldownSection" AS ENUM ('LIFECYCLE', 'CATALOG', 'RELIABILITY', 'MEDIA', 'COSTS');

-- CreateEnum
CREATE TYPE "ServiceCommerceReportReadDenialReason" AS ENUM ('ACCESS_FORBIDDEN', 'STORE_NOT_FOUND');

-- CreateTable
CREATE TABLE "ServiceCommerceReportReadAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "kind" "ServiceCommerceReportReadKind" NOT NULL,
    "drilldownSection" "ServiceCommerceReportDrilldownSection",
    "purpose" TEXT NOT NULL,
    "outcome" "ServiceCommerceReportReadOutcome" NOT NULL,
    "denialReason" "ServiceCommerceReportReadDenialReason",
    "reportStart" TIMESTAMP(3) NOT NULL,
    "reportEnd" TIMESTAMP(3) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceReportReadAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCommerceReportReadAuditEvent_tenantId_storeId_effect_idx" ON "ServiceCommerceReportReadAuditEvent"("tenantId", "storeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceReportReadAuditEvent_actorUserId_effectiveAt_idx" ON "ServiceCommerceReportReadAuditEvent"("actorUserId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceReportReadAuditEvent_tenantId_outcome_effect_idx" ON "ServiceCommerceReportReadAuditEvent"("tenantId", "outcome", "effectiveAt");

-- AddForeignKey
ALTER TABLE "ServiceCommerceReportReadAuditEvent" ADD CONSTRAINT "ServiceCommerceReportReadAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceReportReadAuditEvent" ADD CONSTRAINT "ServiceCommerceReportReadAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
