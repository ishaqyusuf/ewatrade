/*
  Warnings:

  - A unique constraint covering the columns `[id,tenantId]` on the table `RetailOpsStaffInviteToken` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StaffInvitationCommandKind" AS ENUM ('INVITE', 'RESEND', 'REVOKE');

-- CreateEnum
CREATE TYPE "StaffInvitationNotificationStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED');

-- AlterEnum
ALTER TYPE "RetailOpsStaffLifecycleEventType" ADD VALUE 'INVITE_REVOKED';

-- CreateTable
CREATE TABLE "StaffInvitationCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "kind" "StaffInvitationCommandKind" NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvitationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffInvitationNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payloadCiphertext" TEXT,
    "encryptionKeyId" TEXT NOT NULL,
    "status" "StaffInvitationNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimId" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "sendStartedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerKey" TEXT,
    "providerMessageId" TEXT,
    "failureCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffInvitationNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffInvitationNotificationAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "StaffInvitationNotificationStatus" NOT NULL,
    "providerKey" TEXT,
    "providerMessageId" TEXT,
    "failureCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StaffInvitationNotificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffInvitationCommand_tenantId_membershipId_createdAt_idx" ON "StaffInvitationCommand"("tenantId", "membershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitationCommand_tenantId_clientCommandId_key" ON "StaffInvitationCommand"("tenantId", "clientCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitationCommand_id_tenantId_key" ON "StaffInvitationCommand"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitationNotification_commandId_key" ON "StaffInvitationNotification"("commandId");

-- CreateIndex
CREATE INDEX "StaffInvitationNotification_status_nextAttemptAt_idx" ON "StaffInvitationNotification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StaffInvitationNotification_tenantId_membershipId_createdAt_idx" ON "StaffInvitationNotification"("tenantId", "membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffInvitationNotification_invitationId_status_idx" ON "StaffInvitationNotification"("invitationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitationNotification_id_tenantId_key" ON "StaffInvitationNotification"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitationNotification_commandId_tenantId_key" ON "StaffInvitationNotification"("commandId", "tenantId");

-- CreateIndex
CREATE INDEX "StaffInvitationNotificationAttempt_tenantId_notificationId__idx" ON "StaffInvitationNotificationAttempt"("tenantId", "notificationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitationNotificationAttempt_notificationId_number_key" ON "StaffInvitationNotificationAttempt"("notificationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsStaffInviteToken_id_tenantId_key" ON "RetailOpsStaffInviteToken"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "StaffInvitationCommand" ADD CONSTRAINT "StaffInvitationCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitationCommand" ADD CONSTRAINT "StaffInvitationCommand_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitationCommand" ADD CONSTRAINT "StaffInvitationCommand_invitationId_tenantId_fkey" FOREIGN KEY ("invitationId", "tenantId") REFERENCES "RetailOpsStaffInviteToken"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitationNotification" ADD CONSTRAINT "StaffInvitationNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitationNotification" ADD CONSTRAINT "StaffInvitationNotification_commandId_tenantId_fkey" FOREIGN KEY ("commandId", "tenantId") REFERENCES "StaffInvitationCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitationNotification" ADD CONSTRAINT "StaffInvitationNotification_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitationNotification" ADD CONSTRAINT "StaffInvitationNotification_invitationId_tenantId_fkey" FOREIGN KEY ("invitationId", "tenantId") REFERENCES "RetailOpsStaffInviteToken"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitationNotificationAttempt" ADD CONSTRAINT "StaffInvitationNotificationAttempt_notificationId_tenantId_fkey" FOREIGN KEY ("notificationId", "tenantId") REFERENCES "StaffInvitationNotification"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
