-- CreateTable
CREATE TABLE "CatalogAiImageJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "sourceAssetId" TEXT,
    "rootAssetId" TEXT,
    "mode" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "note" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "policyRevision" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "reservedCostMicros" INTEGER NOT NULL,
    "costMicros" INTEGER,
    "usage" JSONB,
    "providerRequestId" TEXT,
    "outputAssetId" TEXT,
    "dispatchToken" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogAiImageJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAiImageVersion" (
    "assetId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "rootAssetId" TEXT NOT NULL,
    "sourceAssetId" TEXT,
    "jobId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogAiImageVersion_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "CatalogAiPolicyCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogAiPolicyCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAiImageJob_outputAssetId_key" ON "CatalogAiImageJob"("outputAssetId");

-- CreateIndex
CREATE INDEX "CatalogAiImageJob_tenantId_createdAt_state_idx" ON "CatalogAiImageJob"("tenantId", "createdAt", "state");

-- CreateIndex
CREATE INDEX "CatalogAiImageJob_tenantId_storeId_actorUserId_contextKey_idx" ON "CatalogAiImageJob"("tenantId", "storeId", "actorUserId", "contextKey");

-- CreateIndex
CREATE INDEX "CatalogAiImageJob_state_createdAt_idx" ON "CatalogAiImageJob"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAiImageJob_tenantId_clientOperationId_key" ON "CatalogAiImageJob"("tenantId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAiImageVersion_jobId_key" ON "CatalogAiImageVersion"("jobId");

-- CreateIndex
CREATE INDEX "CatalogAiImageVersion_tenantId_storeId_rootAssetId_createdA_idx" ON "CatalogAiImageVersion"("tenantId", "storeId", "rootAssetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAiPolicyCommand_revision_key" ON "CatalogAiPolicyCommand"("revision");

-- AddForeignKey
ALTER TABLE "CatalogAiImageJob" ADD CONSTRAINT "CatalogAiImageJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAiImageJob" ADD CONSTRAINT "CatalogAiImageJob_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "Store"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAiImageVersion" ADD CONSTRAINT "CatalogAiImageVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAiImageVersion" ADD CONSTRAINT "CatalogAiImageVersion_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "Store"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
