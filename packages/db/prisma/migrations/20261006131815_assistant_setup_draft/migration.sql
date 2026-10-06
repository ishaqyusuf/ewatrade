-- CreateEnum
CREATE TYPE "AssistantConversationPurpose" AS ENUM ('SETUP', 'GENERAL');

-- CreateEnum
CREATE TYPE "AssistantConversationStatus" AS ENUM ('OFFERED', 'ACTIVE', 'COMPLETED', 'SKIPPED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssistantRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SetupDraftEntityKind" AS ENUM ('PRODUCT', 'SERVICE', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SetupDraftEntityState" AS ENUM ('PROPOSED', 'NEEDS_INPUT', 'CONFIRMED', 'COMMITTED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "purpose" "AssistantConversationPurpose" NOT NULL,
    "status" "AssistantConversationStatus" NOT NULL DEFAULT 'OFFERED',
    "title" TEXT,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "clientRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantRun" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "AssistantRunStatus" NOT NULL DEFAULT 'RUNNING',
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantUsageEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requestClass" TEXT NOT NULL DEFAULT 'chat',
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantBudget" (
    "scopeKey" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantBudget_pkey" PRIMARY KEY ("scopeKey")
);

-- CreateTable
CREATE TABLE "SetupDraft" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupDraftEntity" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "SetupDraftEntityKind" NOT NULL,
    "state" "SetupDraftEntityState" NOT NULL DEFAULT 'PROPOSED',
    "payload" JSONB NOT NULL,
    "source" JSONB,
    "openQuestions" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "committedRecordId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetupDraftEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantConversation_tenantId_storeId_ownerUserId_purpose_idx" ON "AssistantConversation"("tenantId", "storeId", "ownerUserId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantMessage_conversationId_sequence_key" ON "AssistantMessage"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantMessage_conversationId_clientRequestId_key" ON "AssistantMessage"("conversationId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantRun_actorUserId_requestId_key" ON "AssistantRun"("actorUserId", "requestId");

-- CreateIndex
CREATE INDEX "AssistantUsageEvent_tenantId_createdAt_idx" ON "AssistantUsageEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SetupDraft_conversationId_key" ON "SetupDraft"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "SetupDraftEntity_draftId_key_key" ON "SetupDraftEntity"("draftId", "key");

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantRun" ADD CONSTRAINT "AssistantRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantUsageEvent" ADD CONSTRAINT "AssistantUsageEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AssistantRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupDraft" ADD CONSTRAINT "SetupDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupDraftEntity" ADD CONSTRAINT "SetupDraftEntity_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SetupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
