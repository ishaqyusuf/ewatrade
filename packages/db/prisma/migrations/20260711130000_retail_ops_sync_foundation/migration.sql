-- CreateEnum
CREATE TYPE "OfflineDevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OfflineDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "RetailOpsSyncRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RetailOpsSyncEventStatus" AS ENUM ('PENDING', 'APPLIED', 'FAILED', 'SKIPPED', 'CONFLICT', 'WAITING');

-- CreateTable
CREATE TABLE "OfflineDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" "OfflineDevicePlatform" NOT NULL DEFAULT 'UNKNOWN',
    "appVersion" TEXT,
    "status" "OfflineDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "registeredByUserId" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineDeviceRevocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offlineDeviceId" TEXT,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" "OfflineDevicePlatform" NOT NULL DEFAULT 'UNKNOWN',
    "appVersion" TEXT,
    "revokedByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredByUserId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineDeviceRevocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOpsSyncRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "offlineDeviceId" TEXT,
    "deviceId" TEXT,
    "actorUserId" TEXT,
    "status" "RetailOpsSyncRunStatus" NOT NULL DEFAULT 'PENDING',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOpsSyncEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "syncRunId" TEXT,
    "offlineDeviceId" TEXT,
    "deviceId" TEXT,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "RetailOpsSyncEventStatus" NOT NULL DEFAULT 'PENDING',
    "actorUserId" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "dependencyReason" TEXT,
    "createdAtClient" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfflineDevice_tenantId_deviceId_key" ON "OfflineDevice"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "OfflineDevice_tenantId_status_idx" ON "OfflineDevice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OfflineDevice_storeId_lastSeenAt_idx" ON "OfflineDevice"("storeId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "OfflineDeviceRevocation_tenantId_deviceId_idx" ON "OfflineDeviceRevocation"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "OfflineDeviceRevocation_tenantId_revokedAt_idx" ON "OfflineDeviceRevocation"("tenantId", "revokedAt");

-- CreateIndex
CREATE INDEX "OfflineDeviceRevocation_offlineDeviceId_revokedAt_idx" ON "OfflineDeviceRevocation"("offlineDeviceId", "revokedAt");

-- CreateIndex
CREATE INDEX "RetailOpsSyncRun_tenantId_completedAt_idx" ON "RetailOpsSyncRun"("tenantId", "completedAt");

-- CreateIndex
CREATE INDEX "RetailOpsSyncRun_tenantId_status_idx" ON "RetailOpsSyncRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RetailOpsSyncRun_offlineDeviceId_completedAt_idx" ON "RetailOpsSyncRun"("offlineDeviceId", "completedAt");

-- CreateIndex
CREATE INDEX "RetailOpsSyncRun_deviceId_completedAt_idx" ON "RetailOpsSyncRun"("deviceId", "completedAt");

-- CreateIndex
CREATE INDEX "RetailOpsSyncRun_actorUserId_completedAt_idx" ON "RetailOpsSyncRun"("actorUserId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsSyncEvent_tenantId_eventId_key" ON "RetailOpsSyncEvent"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "RetailOpsSyncEvent_tenantId_status_idx" ON "RetailOpsSyncEvent"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RetailOpsSyncEvent_tenantId_type_idx" ON "RetailOpsSyncEvent"("tenantId", "type");

-- CreateIndex
CREATE INDEX "RetailOpsSyncEvent_syncRunId_status_idx" ON "RetailOpsSyncEvent"("syncRunId", "status");

-- CreateIndex
CREATE INDEX "RetailOpsSyncEvent_offlineDeviceId_createdAt_idx" ON "RetailOpsSyncEvent"("offlineDeviceId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailOpsSyncEvent_deviceId_createdAt_idx" ON "RetailOpsSyncEvent"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailOpsSyncEvent_actorUserId_createdAt_idx" ON "RetailOpsSyncEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailOpsSyncEvent_nextRetryAt_idx" ON "RetailOpsSyncEvent"("nextRetryAt");

-- AddForeignKey
ALTER TABLE "OfflineDevice" ADD CONSTRAINT "OfflineDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineDevice" ADD CONSTRAINT "OfflineDevice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineDeviceRevocation" ADD CONSTRAINT "OfflineDeviceRevocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineDeviceRevocation" ADD CONSTRAINT "OfflineDeviceRevocation_offlineDeviceId_fkey" FOREIGN KEY ("offlineDeviceId") REFERENCES "OfflineDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsSyncRun" ADD CONSTRAINT "RetailOpsSyncRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsSyncRun" ADD CONSTRAINT "RetailOpsSyncRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsSyncRun" ADD CONSTRAINT "RetailOpsSyncRun_offlineDeviceId_fkey" FOREIGN KEY ("offlineDeviceId") REFERENCES "OfflineDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsSyncEvent" ADD CONSTRAINT "RetailOpsSyncEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsSyncEvent" ADD CONSTRAINT "RetailOpsSyncEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsSyncEvent" ADD CONSTRAINT "RetailOpsSyncEvent_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "RetailOpsSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsSyncEvent" ADD CONSTRAINT "RetailOpsSyncEvent_offlineDeviceId_fkey" FOREIGN KEY ("offlineDeviceId") REFERENCES "OfflineDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
