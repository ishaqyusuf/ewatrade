-- AlterEnum
ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'CUSTOMER_ATTACHMENT_APPENDED';

-- AlterEnum
ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'CUSTOMER_ATTACHMENT';

-- AlterEnum
ALTER TYPE "StoreConversationMessageKind" ADD VALUE 'CUSTOMER_ATTACHMENT';

-- CreateTable
CREATE TABLE "StoreConversationMessageAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    "sourceAttachmentId" TEXT,
    "prescriptionMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationMessageAttachment_sourceAttachmentId_key" ON "StoreConversationMessageAttachment"("sourceAttachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationMessageAttachment_prescriptionMediaId_key" ON "StoreConversationMessageAttachment"("prescriptionMediaId");

-- CreateIndex
CREATE INDEX "StoreConversationMessageAttachment_tenantId_storeId_convers_idx" ON "StoreConversationMessageAttachment"("tenantId", "storeId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationMessageAttachment_conversationId_messageId_idx" ON "StoreConversationMessageAttachment"("conversationId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationMessageAttachment_messageId_position_key" ON "StoreConversationMessageAttachment"("messageId", "position");

-- AddForeignKey
ALTER TABLE "StoreConversationMessageAttachment" ADD CONSTRAINT "StoreConversationMessageAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationMessageAttachment" ADD CONSTRAINT "StoreConversationMessageAttachment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationMessageAttachment" ADD CONSTRAINT "StoreConversationMessageAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationMessageAttachment" ADD CONSTRAINT "StoreConversationMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StoreConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationMessageAttachment" ADD CONSTRAINT "StoreConversationMessageAttachment_sourceAttachmentId_fkey" FOREIGN KEY ("sourceAttachmentId") REFERENCES "ServiceCommerceSourceAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationMessageAttachment" ADD CONSTRAINT "StoreConversationMessageAttachment_prescriptionMediaId_fkey" FOREIGN KEY ("prescriptionMediaId") REFERENCES "PrescriptionMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
