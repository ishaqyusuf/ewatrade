-- CreateEnum
CREATE TYPE "CommercialOrderChangeMode" AS ENUM ('OFF', 'OPEN', 'APPROVAL_REQUIRED');

-- CreateEnum
CREATE TYPE "CommercialOrderChangeApprovalKind" AS ENUM ('RETURN', 'REFUND');

-- CreateEnum
CREATE TYPE "CommercialOrderChangeApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'USED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CommercialOrderChangePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "returnsMode" "CommercialOrderChangeMode" NOT NULL DEFAULT 'OPEN',
    "refundsMode" "CommercialOrderChangeMode" NOT NULL DEFAULT 'OPEN',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialOrderChangePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrderChangeApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "kind" "CommercialOrderChangeApprovalKind" NOT NULL,
    "status" "CommercialOrderChangeApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "orderStateHash" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "usedAt" TIMESTAMP(3),
    "usedClientOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialOrderChangeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderChangePolicy_storeId_key" ON "CommercialOrderChangePolicy"("storeId");

-- CreateIndex
CREATE INDEX "CommercialOrderChangePolicy_tenantId_idx" ON "CommercialOrderChangePolicy"("tenantId");

-- CreateIndex
CREATE INDEX "CommercialOrderChangeApproval_tenantId_storeId_status_expir_idx" ON "CommercialOrderChangeApproval"("tenantId", "storeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "CommercialOrderChangeApproval_orderId_createdAt_idx" ON "CommercialOrderChangeApproval"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderChangeApproval_tenantId_clientRequestId_key" ON "CommercialOrderChangeApproval"("tenantId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "CommercialOrderChangePolicy" ADD CONSTRAINT "CommercialOrderChangePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderChangePolicy" ADD CONSTRAINT "CommercialOrderChangePolicy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderChangeApproval" ADD CONSTRAINT "CommercialOrderChangeApproval_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
