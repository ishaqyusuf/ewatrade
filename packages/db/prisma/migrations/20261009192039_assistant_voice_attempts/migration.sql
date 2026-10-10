-- AlterTable
ALTER TABLE "AssistantAttachment" ADD COLUMN     "audioBudgetReserved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clientRequestId" TEXT;

-- CreateTable
CREATE TABLE "AssistantTranscriptionAttempt" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'started',
    "errorCode" TEXT,
    "gatewayGeneration" TEXT,
    "providerRequestId" TEXT,
    "audioSeconds" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "billingStatus" TEXT NOT NULL DEFAULT 'unknown',
    "estimatedCostMicros" BIGINT,
    "pricingVersion" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantTranscriptionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantTranscriptionAttempt_provider_startedAt_idx" ON "AssistantTranscriptionAttempt"("provider", "startedAt");

-- CreateIndex
CREATE INDEX "AssistantTranscriptionAttempt_outcome_startedAt_idx" ON "AssistantTranscriptionAttempt"("outcome", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTranscriptionAttempt_attachmentId_generation_ordin_key" ON "AssistantTranscriptionAttempt"("attachmentId", "generation", "ordinal");

-- CreateIndex
CREATE INDEX "AssistantAttachment_actorUserId_clientRequestId_idx" ON "AssistantAttachment"("actorUserId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "AssistantTranscriptionAttempt" ADD CONSTRAINT "AssistantTranscriptionAttempt_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "AssistantAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
