-- CreateEnum
CREATE TYPE "AssistantWhatsAppInboxState" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "AssistantWhatsAppBinding" ADD COLUMN     "inboundSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AssistantWhatsAppInbox" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "providerOccurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "content" JSONB,
    "state" "AssistantWhatsAppInboxState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseGeneration" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "runId" TEXT,
    "errorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantWhatsAppInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppInbox_requestId_key" ON "AssistantWhatsAppInbox"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppInbox_userMessageId_key" ON "AssistantWhatsAppInbox"("userMessageId");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppInbox_state_receivedAt_idx" ON "AssistantWhatsAppInbox"("state", "receivedAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppInbox_expiresAt_idx" ON "AssistantWhatsAppInbox"("expiresAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppInbox_runId_idx" ON "AssistantWhatsAppInbox"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppInbox_phoneNumberId_providerMessageId_key" ON "AssistantWhatsAppInbox"("phoneNumberId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppInbox_bindingId_sequence_key" ON "AssistantWhatsAppInbox"("bindingId", "sequence");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppInbox" ADD CONSTRAINT "AssistantWhatsAppInbox_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "AssistantWhatsAppBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppInbox" ADD CONSTRAINT "AssistantWhatsAppInbox_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AssistantRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
