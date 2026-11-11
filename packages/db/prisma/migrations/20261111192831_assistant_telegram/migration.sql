-- CreateEnum
CREATE TYPE "AssistantTelegramInboxState" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssistantTelegramOutboxState" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AssistantTelegramIdentity" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "selectionGeneration" INTEGER NOT NULL DEFAULT 0,
    "activeBindingId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantTelegramIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTelegramLink" (
    "id" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "claimedTelegramUserId" TEXT,
    "claimedChatId" TEXT,
    "claimedUpdateId" TEXT,
    "confirmedGrantGeneration" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantTelegramLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTelegramGrant" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantTelegramGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTelegramBinding" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "identityGeneration" INTEGER NOT NULL,
    "grantGeneration" INTEGER NOT NULL,
    "selectionGeneration" INTEGER NOT NULL,
    "inboundSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantTelegramBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTelegramInbox" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "content" JSONB,
    "contentDigest" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "state" "AssistantTelegramInboxState" NOT NULL DEFAULT 'PENDING',
    "providerOccurredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseGeneration" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "executionAuthorityDigest" TEXT,
    "runId" TEXT,
    "errorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantTelegramInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTelegramOutbox" (
    "id" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "payload" JSONB,
    "payloadDigest" TEXT NOT NULL,
    "authorityDigest" TEXT NOT NULL,
    "runId" TEXT,
    "messageId" TEXT,
    "state" "AssistantTelegramOutboxState" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseGeneration" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantTelegramOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTelegramActionReview" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "reviewDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decision" TEXT,
    "resultRef" JSONB,
    "editUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantTelegramActionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantTelegramIdentity_userId_revokedAt_idx" ON "AssistantTelegramIdentity"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramIdentity_botId_telegramUserId_key" ON "AssistantTelegramIdentity"("botId", "telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramLink_tokenDigest_key" ON "AssistantTelegramLink"("tokenDigest");

-- CreateIndex
CREATE INDEX "AssistantTelegramLink_userId_createdAt_idx" ON "AssistantTelegramLink"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTelegramLink_expiresAt_idx" ON "AssistantTelegramLink"("expiresAt");

-- CreateIndex
CREATE INDEX "AssistantTelegramGrant_membershipId_revokedAt_idx" ON "AssistantTelegramGrant"("membershipId", "revokedAt");

-- CreateIndex
CREATE INDEX "AssistantTelegramGrant_expiresAt_idx" ON "AssistantTelegramGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramGrant_identityId_tenantId_key" ON "AssistantTelegramGrant"("identityId", "tenantId");

-- CreateIndex
CREATE INDEX "AssistantTelegramBinding_conversationId_idx" ON "AssistantTelegramBinding"("conversationId");

-- CreateIndex
CREATE INDEX "AssistantTelegramBinding_grantId_idx" ON "AssistantTelegramBinding"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramBinding_identityId_selectionGeneration_key" ON "AssistantTelegramBinding"("identityId", "selectionGeneration");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramInbox_requestId_key" ON "AssistantTelegramInbox"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramInbox_userMessageId_key" ON "AssistantTelegramInbox"("userMessageId");

-- CreateIndex
CREATE INDEX "AssistantTelegramInbox_state_nextAttemptAt_createdAt_idx" ON "AssistantTelegramInbox"("state", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTelegramInbox_expiresAt_idx" ON "AssistantTelegramInbox"("expiresAt");

-- CreateIndex
CREATE INDEX "AssistantTelegramInbox_runId_idx" ON "AssistantTelegramInbox"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramInbox_botId_updateId_key" ON "AssistantTelegramInbox"("botId", "updateId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramInbox_bindingId_sequence_key" ON "AssistantTelegramInbox"("bindingId", "sequence");

-- CreateIndex
CREATE INDEX "AssistantTelegramOutbox_state_nextAttemptAt_createdAt_idx" ON "AssistantTelegramOutbox"("state", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTelegramOutbox_expiresAt_idx" ON "AssistantTelegramOutbox"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramOutbox_inboxId_sequence_key" ON "AssistantTelegramOutbox"("inboxId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTelegramActionReview_outboxId_key" ON "AssistantTelegramActionReview"("outboxId");

-- CreateIndex
CREATE INDEX "AssistantTelegramActionReview_bindingId_expiresAt_idx" ON "AssistantTelegramActionReview"("bindingId", "expiresAt");

-- CreateIndex
CREATE INDEX "AssistantTelegramActionReview_proposalId_revision_idx" ON "AssistantTelegramActionReview"("proposalId", "revision");

-- AddForeignKey
ALTER TABLE "AssistantTelegramIdentity" ADD CONSTRAINT "AssistantTelegramIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramLink" ADD CONSTRAINT "AssistantTelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramLink" ADD CONSTRAINT "AssistantTelegramLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramLink" ADD CONSTRAINT "AssistantTelegramLink_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "Store"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramLink" ADD CONSTRAINT "AssistantTelegramLink_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramGrant" ADD CONSTRAINT "AssistantTelegramGrant_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "AssistantTelegramIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramGrant" ADD CONSTRAINT "AssistantTelegramGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramGrant" ADD CONSTRAINT "AssistantTelegramGrant_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "Store"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramGrant" ADD CONSTRAINT "AssistantTelegramGrant_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramBinding" ADD CONSTRAINT "AssistantTelegramBinding_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "AssistantTelegramIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramBinding" ADD CONSTRAINT "AssistantTelegramBinding_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "AssistantTelegramGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramBinding" ADD CONSTRAINT "AssistantTelegramBinding_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramInbox" ADD CONSTRAINT "AssistantTelegramInbox_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "AssistantTelegramBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramInbox" ADD CONSTRAINT "AssistantTelegramInbox_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AssistantRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramOutbox" ADD CONSTRAINT "AssistantTelegramOutbox_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "AssistantTelegramInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramActionReview" ADD CONSTRAINT "AssistantTelegramActionReview_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "AssistantTelegramBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramActionReview" ADD CONSTRAINT "AssistantTelegramActionReview_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "AssistantTelegramOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTelegramActionReview" ADD CONSTRAINT "AssistantTelegramActionReview_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AssistantActionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
