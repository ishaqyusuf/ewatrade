-- CreateEnum
CREATE TYPE "AssistantWhatsAppAttemptState" AS ENUM ('STARTED', 'ACCEPTED', 'REJECTED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "AssistantWhatsAppAttempt" (
    "id" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "callbackDigest" TEXT NOT NULL,
    "state" "AssistantWhatsAppAttemptState" NOT NULL DEFAULT 'STARTED',
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantWhatsAppAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantWhatsAppReceipt" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "eventDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerOccurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureCode" TEXT,

    CONSTRAINT "AssistantWhatsAppReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppAttempt_callbackDigest_key" ON "AssistantWhatsAppAttempt"("callbackDigest");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppAttempt_state_startedAt_idx" ON "AssistantWhatsAppAttempt"("state", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppAttempt_outboxId_generation_key" ON "AssistantWhatsAppAttempt"("outboxId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppReceipt_eventDigest_key" ON "AssistantWhatsAppReceipt"("eventDigest");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppReceipt_attemptId_providerOccurredAt_idx" ON "AssistantWhatsAppReceipt"("attemptId", "providerOccurredAt");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppAttempt" ADD CONSTRAINT "AssistantWhatsAppAttempt_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "AssistantWhatsAppOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppReceipt" ADD CONSTRAINT "AssistantWhatsAppReceipt_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssistantWhatsAppAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
