-- CreateEnum
CREATE TYPE "AssistantReceiptReadStatus" AS ENUM ('READ', 'NOT_RECEIPT', 'UNREADABLE', 'FAILED', 'AWAITING_ORDER', 'AWAITING_ACCOUNT', 'AWAITING_PURPOSE', 'DRAFTED', 'DUPLICATE', 'RESOLVED');

-- CreateTable
CREATE TABLE "AssistantReceiptRead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "status" "AssistantReceiptReadStatus" NOT NULL DEFAULT 'READ',
    "extraction" JSONB,
    "amountMinor" BIGINT,
    "currencyCode" TEXT,
    "bankReference" TEXT,
    "outcome" JSONB,
    "proposalId" TEXT,
    "excessMinor" BIGINT,
    "excessOrderId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "providerRequestId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantReceiptRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantReceiptRead_attachmentId_key" ON "AssistantReceiptRead"("attachmentId");

-- CreateIndex
CREATE INDEX "AssistantReceiptRead_tenantId_bankReference_idx" ON "AssistantReceiptRead"("tenantId", "bankReference");

-- CreateIndex
CREATE INDEX "AssistantReceiptRead_conversationId_actorUserId_createdAt_idx" ON "AssistantReceiptRead"("conversationId", "actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantReceiptRead_tenantId_createdAt_idx" ON "AssistantReceiptRead"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantReceiptRead" ADD CONSTRAINT "AssistantReceiptRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
