-- CreateEnum
CREATE TYPE "StoreConversationGuestIdentityStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "StoreConversationGuestCredentialPurpose" AS ENUM ('WEB_DEVICE', 'MOBILE_DEVICE');

-- CreateEnum
CREATE TYPE "StoreConversationGuestCredentialStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StoreConversationLifecycle" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StoreConversationModerationState" AS ENUM ('OPEN', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "StoreConversationMessageAuthorKind" AS ENUM ('CUSTOMER', 'STORE_ATTENDANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StoreConversationMessageChannel" AS ENUM ('WEB', 'MOBILE', 'WHATSAPP', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StoreConversationMessageKind" AS ENUM ('CUSTOMER_TEXT', 'STORE_TEXT', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "StoreConversationRequestKind" AS ENUM ('COMMERCE_INQUIRY', 'SERVICE_REQUEST', 'PRESCRIPTION_REQUEST');

-- CreateEnum
CREATE TYPE "StoreConversationCommandKind" AS ENUM ('CUSTOMER_TEXT', 'CLAIM', 'STORE_REPLY');

-- CreateEnum
CREATE TYPE "StoreConversationAssignmentEventType" AS ENUM ('CLAIMED', 'RELEASED', 'REASSIGNED');

-- CreateEnum
CREATE TYPE "StoreConversationAuditEventType" AS ENUM ('BOOTSTRAPPED', 'CUSTOMER_MESSAGE_APPENDED', 'CLAIMED', 'STORE_REPLY_APPENDED', 'ARCHIVED', 'REACTIVATED', 'RESTRICTED', 'REINSTATED');

-- CreateTable
CREATE TABLE "StoreConversationGuestIdentity" (
    "id" TEXT NOT NULL,
    "status" "StoreConversationGuestIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationGuestIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationGuestCredential" (
    "id" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "purpose" "StoreConversationGuestCredentialPurpose" NOT NULL,
    "status" "StoreConversationGuestCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationGuestCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "lifecycle" "StoreConversationLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "moderationState" "StoreConversationModerationState" NOT NULL DEFAULT 'OPEN',
    "lastMessageSequence" INTEGER NOT NULL DEFAULT 0,
    "assignedMembershipId" TEXT,
    "assignmentRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "restrictedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "authorKind" "StoreConversationMessageAuthorKind" NOT NULL,
    "authorMembershipId" TEXT,
    "channel" "StoreConversationMessageChannel" NOT NULL,
    "kind" "StoreConversationMessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationRequestLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "StoreConversationRequestKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationRequestLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationCommandReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "kind" "StoreConversationCommandKind" NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "messageId" TEXT,
    "sourceKind" "StoreConversationRequestKind",
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationCommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationAssignmentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "fromMembershipId" TEXT,
    "toMembershipId" TEXT,
    "type" "StoreConversationAssignmentEventType" NOT NULL,
    "assignmentRevision" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationAssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorKind" "StoreConversationMessageAuthorKind" NOT NULL,
    "actorMembershipId" TEXT,
    "type" "StoreConversationAuditEventType" NOT NULL,
    "conversationSequence" INTEGER,
    "reasonCode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreConversationGuestIdentity_status_lastSeenAt_idx" ON "StoreConversationGuestIdentity"("status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestCredential_tokenDigest_key" ON "StoreConversationGuestCredential"("tokenDigest");

-- CreateIndex
CREATE INDEX "StoreConversationGuestCredential_guestIdentityId_status_exp_idx" ON "StoreConversationGuestCredential"("guestIdentityId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreConversation_tenantId_storeId_lifecycle_lastActivityAt_idx" ON "StoreConversation"("tenantId", "storeId", "lifecycle", "lastActivityAt");

-- CreateIndex
CREATE INDEX "StoreConversation_assignedMembershipId_lifecycle_lastActivi_idx" ON "StoreConversation"("assignedMembershipId", "lifecycle", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversation_storeId_guestIdentityId_key" ON "StoreConversation"("storeId", "guestIdentityId");

-- CreateIndex
CREATE INDEX "StoreConversationMessage_tenantId_storeId_occurredAt_idx" ON "StoreConversationMessage"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationMessage_conversationId_sequence_idx" ON "StoreConversationMessage"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationMessage_conversationId_sequence_key" ON "StoreConversationMessage"("conversationId", "sequence");

-- CreateIndex
CREATE INDEX "StoreConversationRequestLink_tenantId_storeId_kind_sourceId_idx" ON "StoreConversationRequestLink"("tenantId", "storeId", "kind", "sourceId");

-- CreateIndex
CREATE INDEX "StoreConversationRequestLink_messageId_idx" ON "StoreConversationRequestLink"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationRequestLink_messageId_kind_sourceId_key" ON "StoreConversationRequestLink"("messageId", "kind", "sourceId");

-- CreateIndex
CREATE INDEX "StoreConversationCommandReceipt_tenantId_storeId_createdAt_idx" ON "StoreConversationCommandReceipt"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationCommandReceipt_conversationId_clientOperat_key" ON "StoreConversationCommandReceipt"("conversationId", "clientOperationId");

-- CreateIndex
CREATE INDEX "StoreConversationAssignmentEvent_tenantId_storeId_occurredA_idx" ON "StoreConversationAssignmentEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationAssignmentEvent_conversationId_assignmentR_idx" ON "StoreConversationAssignmentEvent"("conversationId", "assignmentRevision");

-- CreateIndex
CREATE INDEX "StoreConversationAuditEvent_tenantId_storeId_occurredAt_idx" ON "StoreConversationAuditEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationAuditEvent_conversationId_occurredAt_idx" ON "StoreConversationAuditEvent"("conversationId", "occurredAt");

-- AddForeignKey
ALTER TABLE "StoreConversationGuestCredential" ADD CONSTRAINT "StoreConversationGuestCredential_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversation" ADD CONSTRAINT "StoreConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversation" ADD CONSTRAINT "StoreConversation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversation" ADD CONSTRAINT "StoreConversation_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversation" ADD CONSTRAINT "StoreConversation_assignedMembershipId_fkey" FOREIGN KEY ("assignedMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationMessage" ADD CONSTRAINT "StoreConversationMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationMessage" ADD CONSTRAINT "StoreConversationMessage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationMessage" ADD CONSTRAINT "StoreConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationMessage" ADD CONSTRAINT "StoreConversationMessage_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationRequestLink" ADD CONSTRAINT "StoreConversationRequestLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationRequestLink" ADD CONSTRAINT "StoreConversationRequestLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationRequestLink" ADD CONSTRAINT "StoreConversationRequestLink_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationRequestLink" ADD CONSTRAINT "StoreConversationRequestLink_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StoreConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationCommandReceipt" ADD CONSTRAINT "StoreConversationCommandReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationCommandReceipt" ADD CONSTRAINT "StoreConversationCommandReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationCommandReceipt" ADD CONSTRAINT "StoreConversationCommandReceipt_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationCommandReceipt" ADD CONSTRAINT "StoreConversationCommandReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StoreConversationMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAssignmentEvent" ADD CONSTRAINT "StoreConversationAssignmentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAssignmentEvent" ADD CONSTRAINT "StoreConversationAssignmentEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAssignmentEvent" ADD CONSTRAINT "StoreConversationAssignmentEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAssignmentEvent" ADD CONSTRAINT "StoreConversationAssignmentEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAssignmentEvent" ADD CONSTRAINT "StoreConversationAssignmentEvent_fromMembershipId_fkey" FOREIGN KEY ("fromMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAssignmentEvent" ADD CONSTRAINT "StoreConversationAssignmentEvent_toMembershipId_fkey" FOREIGN KEY ("toMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAuditEvent" ADD CONSTRAINT "StoreConversationAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAuditEvent" ADD CONSTRAINT "StoreConversationAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAuditEvent" ADD CONSTRAINT "StoreConversationAuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAuditEvent" ADD CONSTRAINT "StoreConversationAuditEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
