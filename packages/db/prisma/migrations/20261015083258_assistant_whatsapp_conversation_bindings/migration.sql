-- AlterTable
ALTER TABLE "AssistantWhatsAppIdentity" ADD COLUMN     "activeBindingId" TEXT,
ADD COLUMN     "selectionGeneration" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "AssistantWhatsAppBinding" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "identityGeneration" INTEGER NOT NULL,
    "grantGeneration" INTEGER NOT NULL,
    "selectionGeneration" INTEGER NOT NULL,
    "conversationId" TEXT NOT NULL,
    "purpose" "AssistantConversationPurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantWhatsAppBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantWhatsAppBinding_conversationId_idx" ON "AssistantWhatsAppBinding"("conversationId");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppBinding_grantId_grantGeneration_idx" ON "AssistantWhatsAppBinding"("grantId", "grantGeneration");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppBinding_identityId_selectionGeneration_key" ON "AssistantWhatsAppBinding"("identityId", "selectionGeneration");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppBinding" ADD CONSTRAINT "AssistantWhatsAppBinding_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "AssistantWhatsAppIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppBinding" ADD CONSTRAINT "AssistantWhatsAppBinding_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "AssistantWhatsAppGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppBinding" ADD CONSTRAINT "AssistantWhatsAppBinding_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
