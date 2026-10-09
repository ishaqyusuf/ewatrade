-- CreateEnum
CREATE TYPE "AssistantAttachmentKind" AS ENUM ('IMAGE', 'AUDIO', 'PDF', 'SPREADSHEET', 'TEXT');

-- CreateEnum
CREATE TYPE "AssistantAttachmentStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "AssistantBudget" ADD COLUMN     "audioSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visionImages" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AssistantUsageEvent" ADD COLUMN     "attachmentId" TEXT,
ADD COLUMN     "audioSeconds" INTEGER,
ADD COLUMN     "imageCount" INTEGER,
ALTER COLUMN "runId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AssistantAttachment" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "messageId" TEXT,
    "kind" "AssistantAttachmentKind" NOT NULL,
    "status" "AssistantAttachmentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "durationMs" INTEGER,
    "storageProvider" TEXT,
    "storageStoreId" TEXT,
    "storagePath" TEXT,
    "transcript" TEXT,
    "extraction" JSONB,
    "errorCode" TEXT,
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "uploadExpiresAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantAttachment_conversationId_createdAt_idx" ON "AssistantAttachment"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantAttachment_status_leaseUntil_idx" ON "AssistantAttachment"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "AssistantAttachment_retentionUntil_idx" ON "AssistantAttachment"("retentionUntil");

-- AddForeignKey
ALTER TABLE "AssistantAttachment" ADD CONSTRAINT "AssistantAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
