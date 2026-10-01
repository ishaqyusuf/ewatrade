-- AlterTable
ALTER TABLE "StoreConversation" ADD COLUMN     "customerBlockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StoreConversationCustomerReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "principalKind" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "StoreConversationCustomerReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationCustomerBlockCommand" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "principalKind" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL,
    "resultingBlockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationCustomerBlockCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreConversationCustomerReport_status_createdAt_idx" ON "StoreConversationCustomerReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationCustomerReport_tenantId_storeId_status_cre_idx" ON "StoreConversationCustomerReport"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationCustomerReport_conversationId_principalKin_key" ON "StoreConversationCustomerReport"("conversationId", "principalKind", "principalId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationCustomerBlockCommand_conversationId_princi_key" ON "StoreConversationCustomerBlockCommand"("conversationId", "principalKind", "principalId", "clientOperationId");

-- AddForeignKey
ALTER TABLE "StoreConversationCustomerBlockCommand" ADD CONSTRAINT "StoreConversationCustomerBlockCommand_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
