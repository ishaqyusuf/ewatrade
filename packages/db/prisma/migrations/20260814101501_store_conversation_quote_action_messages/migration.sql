-- AlterEnum
ALTER TYPE "StoreConversationMessageKind" ADD VALUE 'ACTION_MESSAGE';

-- CreateTable
CREATE TABLE "StoreConversationActionMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sourceKind" "StoreConversationRequestKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "quoteSnapshot" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationActionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationActionMessage_messageId_key" ON "StoreConversationActionMessage"("messageId");

-- CreateIndex
CREATE INDEX "StoreConversationActionMessage_tenantId_storeId_occurredAt_idx" ON "StoreConversationActionMessage"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationActionMessage_sourceKind_sourceId_idx" ON "StoreConversationActionMessage"("sourceKind", "sourceId");

-- CreateIndex
CREATE INDEX "StoreConversationActionMessage_quoteVersionId_idx" ON "StoreConversationActionMessage"("quoteVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationActionMessage_conversationId_quoteVersionI_key" ON "StoreConversationActionMessage"("conversationId", "quoteVersionId");

-- AddForeignKey
ALTER TABLE "StoreConversationActionMessage" ADD CONSTRAINT "StoreConversationActionMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationActionMessage" ADD CONSTRAINT "StoreConversationActionMessage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationActionMessage" ADD CONSTRAINT "StoreConversationActionMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationActionMessage" ADD CONSTRAINT "StoreConversationActionMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StoreConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationActionMessage" ADD CONSTRAINT "StoreConversationActionMessage_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
