-- CreateEnum
CREATE TYPE "StoreConversationAccountInvitationMilestone" AS ENUM ('FIRST_RELEASED_QUOTE');

-- CreateEnum
CREATE TYPE "StoreConversationAccountInvitationStatus" AS ENUM ('OFFERED', 'DISMISSED', 'LINKED');

-- CreateEnum
CREATE TYPE "StoreConversationAccountAccessStatus" AS ENUM ('ACTIVE');

-- CreateEnum
CREATE TYPE "StoreConversationAccountAuditType" AS ENUM ('INVITATION_DISMISSED', 'ACCOUNT_LINKED', 'ACCOUNT_LINK_DENIED', 'DEVICE_REVOKED', 'DEVICE_REVOCATION_DENIED');

-- CreateEnum
CREATE TYPE "StoreConversationAccountAuditPurpose" AS ENUM ('ACCOUNT_ADOPTION', 'DEVICE_SECURITY');

-- CreateEnum
CREATE TYPE "StoreConversationAccountAuditOutcome" AS ENUM ('ALLOWED', 'DENIED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'ACCOUNT_INVITATION_DISMISSED';
ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'ACCOUNT_CONVERSATIONS_LINKED';
ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'ACCOUNT_DEVICE_REVOKED';

-- AlterEnum
ALTER TYPE "StoreConversationMessageKind" ADD VALUE 'ACCOUNT_INVITATION';

-- CreateTable
CREATE TABLE "StoreConversationAccountInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "milestone" "StoreConversationAccountInvitationMilestone" NOT NULL,
    "status" "StoreConversationAccountInvitationStatus" NOT NULL DEFAULT 'OFFERED',
    "dismissedAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationAccountInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationAccountAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "accountUserId" TEXT NOT NULL,
    "linkedGuestIdentityId" TEXT NOT NULL,
    "status" "StoreConversationAccountAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationAccountAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationAccountLinkCommand" (
    "id" TEXT NOT NULL,
    "accountUserId" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "linkedConversationCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationAccountLinkCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationAccountAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "storeId" TEXT,
    "conversationId" TEXT,
    "invitationId" TEXT,
    "actorAccountUserId" TEXT NOT NULL,
    "guestIdentityId" TEXT,
    "credentialId" TEXT,
    "type" "StoreConversationAccountAuditType" NOT NULL,
    "purpose" "StoreConversationAccountAuditPurpose" NOT NULL,
    "outcome" "StoreConversationAccountAuditOutcome" NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT,
    "reasonCode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationAccountAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAccountInvitation_messageId_key" ON "StoreConversationAccountInvitation"("messageId");

-- CreateIndex
CREATE INDEX "StoreConversationAccountInvitation_tenantId_storeId_created_idx" ON "StoreConversationAccountInvitation"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreConversationAccountInvitation_quoteVersionId_idx" ON "StoreConversationAccountInvitation"("quoteVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAccountInvitation_conversationId_milestone_key" ON "StoreConversationAccountInvitation"("conversationId", "milestone");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAccountAccess_conversationId_key" ON "StoreConversationAccountAccess"("conversationId");

-- CreateIndex
CREATE INDEX "StoreConversationAccountAccess_accountUserId_status_lastOpe_idx" ON "StoreConversationAccountAccess"("accountUserId", "status", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "StoreConversationAccountAccess_linkedGuestIdentityId_status_idx" ON "StoreConversationAccountAccess"("linkedGuestIdentityId", "status");

-- CreateIndex
CREATE INDEX "StoreConversationAccountAccess_tenantId_storeId_status_idx" ON "StoreConversationAccountAccess"("tenantId", "storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAccountAccess_storeId_accountUserId_key" ON "StoreConversationAccountAccess"("storeId", "accountUserId");

-- CreateIndex
CREATE INDEX "StoreConversationAccountLinkCommand_guestIdentityId_created_idx" ON "StoreConversationAccountLinkCommand"("guestIdentityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAccountLinkCommand_accountUserId_clientOpe_key" ON "StoreConversationAccountLinkCommand"("accountUserId", "clientOperationId");

-- CreateIndex
CREATE INDEX "StoreConversationAccountAuditEvent_actorAccountUserId_occur_idx" ON "StoreConversationAccountAuditEvent"("actorAccountUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationAccountAuditEvent_tenantId_storeId_occurre_idx" ON "StoreConversationAccountAuditEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationAccountAuditEvent_conversationId_occurredA_idx" ON "StoreConversationAccountAuditEvent"("conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationAccountAuditEvent_guestIdentityId_occurred_idx" ON "StoreConversationAccountAuditEvent"("guestIdentityId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationAccountAuditEvent_credentialId_occurredAt_idx" ON "StoreConversationAccountAuditEvent"("credentialId", "occurredAt");

-- AddForeignKey
ALTER TABLE "StoreConversationAccountInvitation" ADD CONSTRAINT "StoreConversationAccountInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountInvitation" ADD CONSTRAINT "StoreConversationAccountInvitation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountInvitation" ADD CONSTRAINT "StoreConversationAccountInvitation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountInvitation" ADD CONSTRAINT "StoreConversationAccountInvitation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StoreConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountInvitation" ADD CONSTRAINT "StoreConversationAccountInvitation_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAccess" ADD CONSTRAINT "StoreConversationAccountAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAccess" ADD CONSTRAINT "StoreConversationAccountAccess_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAccess" ADD CONSTRAINT "StoreConversationAccountAccess_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAccess" ADD CONSTRAINT "StoreConversationAccountAccess_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAccess" ADD CONSTRAINT "StoreConversationAccountAccess_linkedGuestIdentityId_fkey" FOREIGN KEY ("linkedGuestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountLinkCommand" ADD CONSTRAINT "StoreConversationAccountLinkCommand_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountLinkCommand" ADD CONSTRAINT "StoreConversationAccountLinkCommand_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAuditEvent" ADD CONSTRAINT "StoreConversationAccountAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAuditEvent" ADD CONSTRAINT "StoreConversationAccountAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAuditEvent" ADD CONSTRAINT "StoreConversationAccountAuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAuditEvent" ADD CONSTRAINT "StoreConversationAccountAuditEvent_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "StoreConversationAccountInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAuditEvent" ADD CONSTRAINT "StoreConversationAccountAuditEvent_actorAccountUserId_fkey" FOREIGN KEY ("actorAccountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAuditEvent" ADD CONSTRAINT "StoreConversationAccountAuditEvent_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountAuditEvent" ADD CONSTRAINT "StoreConversationAccountAuditEvent_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
