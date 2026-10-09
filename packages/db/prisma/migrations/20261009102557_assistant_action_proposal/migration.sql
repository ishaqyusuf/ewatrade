-- CreateEnum
CREATE TYPE "AssistantActionProposalStatus" AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "AssistantActionProposal" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "targetRecordId" TEXT,
    "targetRevision" TEXT,
    "roleSnapshot" TEXT NOT NULL,
    "approvalTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "AssistantActionProposalStatus" NOT NULL DEFAULT 'PENDING',
    "executedResult" JSONB,
    "errorCode" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantActionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- 20261009092723_product_creation_assistant also creates this table; these
-- statements are idempotent so either migration order applies cleanly.
CREATE TABLE IF NOT EXISTS "ProductAnalyticsEvent" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "envelope" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "ProductAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantActionProposal_conversationId_status_createdAt_idx" ON "AssistantActionProposal"("conversationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantActionProposal_tenantId_storeId_actorUserId_status_idx" ON "AssistantActionProposal"("tenantId", "storeId", "actorUserId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantActionProposal_tenantId_actorUserId_idempotencyKey_key" ON "AssistantActionProposal"("tenantId", "actorUserId", "idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductAnalyticsEvent_deliveredAt_availableAt_leaseUntil_idx" ON "ProductAnalyticsEvent"("deliveredAt", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductAnalyticsEvent_expiresAt_idx" ON "ProductAnalyticsEvent"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductAnalyticsEvent_userId_idx" ON "ProductAnalyticsEvent"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductAnalyticsEvent_tenantId_idx" ON "ProductAnalyticsEvent"("tenantId");

-- AddForeignKey
ALTER TABLE "AssistantActionProposal" ADD CONSTRAINT "AssistantActionProposal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantActionProposal" ADD CONSTRAINT "AssistantActionProposal_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductAnalyticsEvent" ADD CONSTRAINT "ProductAnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductAnalyticsEvent" ADD CONSTRAINT "ProductAnalyticsEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
