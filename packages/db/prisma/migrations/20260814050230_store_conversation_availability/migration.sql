-- CreateEnum
CREATE TYPE "StoreConversationAvailabilityAuditEventType" AS ENUM ('SCHEDULE_UPDATED', 'PAUSED', 'RESUMED');

-- CreateEnum
CREATE TYPE "StoreConversationCustomerWording" AS ENUM ('TEMPORARILY_UNAVAILABLE', 'OUTSIDE_SERVICE_HOURS');

-- CreateTable
CREATE TABLE "StoreConversationAvailabilityConfiguration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "weeklyHours" JSONB NOT NULL,
    "manualPaused" BOOLEAN NOT NULL DEFAULT false,
    "customerWording" "StoreConversationCustomerWording" NOT NULL DEFAULT 'TEMPORARILY_UNAVAILABLE',
    "pauseReason" TEXT,
    "pausedAt" TIMESTAMP(3),
    "pausedByUserId" TEXT,
    "resumedAt" TIMESTAMP(3),
    "resumedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationAvailabilityConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationAvailabilityAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" "StoreConversationAvailabilityAuditEventType" NOT NULL,
    "configurationRevision" INTEGER NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "configurationSnapshot" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationAvailabilityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAvailabilityConfiguration_storeId_key" ON "StoreConversationAvailabilityConfiguration"("storeId");

-- CreateIndex
CREATE INDEX "StoreConversationAvailabilityConfiguration_tenantId_manualP_idx" ON "StoreConversationAvailabilityConfiguration"("tenantId", "manualPaused", "updatedAt");

-- CreateIndex
CREATE INDEX "StoreConversationAvailabilityAuditEvent_tenantId_storeId_oc_idx" ON "StoreConversationAvailabilityAuditEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationAvailabilityAuditEvent_configurationId_con_idx" ON "StoreConversationAvailabilityAuditEvent"("configurationId", "configurationRevision");

-- CreateIndex
CREATE INDEX "StoreConversationAvailabilityAuditEvent_actorUserId_occurre_idx" ON "StoreConversationAvailabilityAuditEvent"("actorUserId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAvailabilityAuditEvent_storeId_clientOpera_key" ON "StoreConversationAvailabilityAuditEvent"("storeId", "clientOperationId");

-- AddForeignKey
ALTER TABLE "StoreConversationAvailabilityConfiguration" ADD CONSTRAINT "StoreConversationAvailabilityConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAvailabilityConfiguration" ADD CONSTRAINT "StoreConversationAvailabilityConfiguration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAvailabilityAuditEvent" ADD CONSTRAINT "StoreConversationAvailabilityAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAvailabilityAuditEvent" ADD CONSTRAINT "StoreConversationAvailabilityAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAvailabilityAuditEvent" ADD CONSTRAINT "StoreConversationAvailabilityAuditEvent_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "StoreConversationAvailabilityConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
