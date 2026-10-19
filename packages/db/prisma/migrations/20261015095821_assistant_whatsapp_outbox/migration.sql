-- CreateEnum
CREATE TYPE "AssistantWhatsAppOutboxState" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "AssistantWhatsAppInbox" ADD COLUMN     "executionAuthorityDigest" TEXT;

-- CreateTable
CREATE TABLE "AssistantWhatsAppOutbox" (
    "id" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "runId" TEXT,
    "messageId" TEXT,
    "responseRevision" INTEGER NOT NULL DEFAULT 1,
    "chunkIndex" INTEGER NOT NULL,
    "chunkCount" INTEGER NOT NULL,
    "rendererVersion" TEXT NOT NULL,
    "authorityDigest" TEXT NOT NULL,
    "content" TEXT,
    "contentDigest" TEXT NOT NULL,
    "state" "AssistantWhatsAppOutboxState" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseGeneration" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantWhatsAppOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantWhatsAppOutbox_state_nextAttemptAt_createdAt_idx" ON "AssistantWhatsAppOutbox"("state", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppOutbox_expiresAt_idx" ON "AssistantWhatsAppOutbox"("expiresAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppOutbox_runId_idx" ON "AssistantWhatsAppOutbox"("runId");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppOutbox_messageId_idx" ON "AssistantWhatsAppOutbox"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppOutbox_inboxId_responseRevision_chunkIndex_key" ON "AssistantWhatsAppOutbox"("inboxId", "responseRevision", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppOutbox_phoneNumberId_providerMessageId_key" ON "AssistantWhatsAppOutbox"("phoneNumberId", "providerMessageId");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppOutbox" ADD CONSTRAINT "AssistantWhatsAppOutbox_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "AssistantWhatsAppInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppOutbox" ADD CONSTRAINT "AssistantWhatsAppOutbox_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AssistantRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppOutbox" ADD CONSTRAINT "AssistantWhatsAppOutbox_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AssistantMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
