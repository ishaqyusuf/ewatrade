-- CreateTable
CREATE TABLE "CustomerMessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerMessageTemplate_tenantId_storeId_idx" ON "CustomerMessageTemplate"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "CustomerMessageTemplate_updatedByUserId_idx" ON "CustomerMessageTemplate"("updatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMessageTemplate_tenantId_scopeKey_eventKey_key" ON "CustomerMessageTemplate"("tenantId", "scopeKey", "eventKey");

-- AddForeignKey
ALTER TABLE "CustomerMessageTemplate" ADD CONSTRAINT "CustomerMessageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMessageTemplate" ADD CONSTRAINT "CustomerMessageTemplate_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "Store"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMessageTemplate" ADD CONSTRAINT "CustomerMessageTemplate_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
