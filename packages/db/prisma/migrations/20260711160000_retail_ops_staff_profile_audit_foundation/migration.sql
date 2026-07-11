-- CreateEnum
CREATE TYPE "RetailOpsStaffInviteTokenStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RetailOpsStaffLifecycleEventType" AS ENUM ('INVITED', 'INVITE_REFRESHED', 'ONBOARDING_COMPLETED', 'SUSPENDED', 'REACTIVATED', 'REMOVED', 'ROLE_CHANGED');

-- CreateTable
CREATE TABLE "RetailOpsStaffProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT,
    "defaultStoreId" TEXT,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "employeeCode" TEXT,
    "roleSnapshot" "MembershipRole" NOT NULL,
    "statusSnapshot" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsStaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOpsStaffInviteToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT,
    "invitedUserId" TEXT,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "RetailOpsStaffInviteTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedByUserId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsStaffInviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOpsStaffLifecycleEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT,
    "staffProfileId" TEXT,
    "staffUserId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "RetailOpsStaffLifecycleEventType" NOT NULL,
    "fromStatus" "MembershipStatus",
    "toStatus" "MembershipStatus",
    "fromRole" "MembershipRole",
    "toRole" "MembershipRole",
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailOpsStaffLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsStaffProfile_membershipId_key" ON "RetailOpsStaffProfile"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsStaffProfile_tenantId_userId_key" ON "RetailOpsStaffProfile"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsStaffProfile_tenantId_employeeCode_key" ON "RetailOpsStaffProfile"("tenantId", "employeeCode");

-- CreateIndex
CREATE INDEX "RetailOpsStaffProfile_tenantId_statusSnapshot_idx" ON "RetailOpsStaffProfile"("tenantId", "statusSnapshot");

-- CreateIndex
CREATE INDEX "RetailOpsStaffProfile_defaultStoreId_statusSnapshot_idx" ON "RetailOpsStaffProfile"("defaultStoreId", "statusSnapshot");

-- CreateIndex
CREATE INDEX "RetailOpsStaffProfile_roleSnapshot_statusSnapshot_idx" ON "RetailOpsStaffProfile"("roleSnapshot", "statusSnapshot");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsStaffInviteToken_tokenHash_key" ON "RetailOpsStaffInviteToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsStaffInviteToken_tenantId_email_role_externalId_key" ON "RetailOpsStaffInviteToken"("tenantId", "email", "role", "externalId");

-- CreateIndex
CREATE INDEX "RetailOpsStaffInviteToken_tenantId_status_expiresAt_idx" ON "RetailOpsStaffInviteToken"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "RetailOpsStaffInviteToken_membershipId_createdAt_idx" ON "RetailOpsStaffInviteToken"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailOpsStaffInviteToken_invitedUserId_createdAt_idx" ON "RetailOpsStaffInviteToken"("invitedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailOpsStaffInviteToken_invitedByUserId_createdAt_idx" ON "RetailOpsStaffInviteToken"("invitedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailOpsStaffLifecycleEvent_tenantId_happenedAt_idx" ON "RetailOpsStaffLifecycleEvent"("tenantId", "happenedAt");

-- CreateIndex
CREATE INDEX "RetailOpsStaffLifecycleEvent_membershipId_happenedAt_idx" ON "RetailOpsStaffLifecycleEvent"("membershipId", "happenedAt");

-- CreateIndex
CREATE INDEX "RetailOpsStaffLifecycleEvent_staffProfileId_happenedAt_idx" ON "RetailOpsStaffLifecycleEvent"("staffProfileId", "happenedAt");

-- CreateIndex
CREATE INDEX "RetailOpsStaffLifecycleEvent_staffUserId_happenedAt_idx" ON "RetailOpsStaffLifecycleEvent"("staffUserId", "happenedAt");

-- CreateIndex
CREATE INDEX "RetailOpsStaffLifecycleEvent_actorUserId_happenedAt_idx" ON "RetailOpsStaffLifecycleEvent"("actorUserId", "happenedAt");

-- CreateIndex
CREATE INDEX "RetailOpsStaffLifecycleEvent_type_happenedAt_idx" ON "RetailOpsStaffLifecycleEvent"("type", "happenedAt");

-- AddForeignKey
ALTER TABLE "RetailOpsStaffProfile" ADD CONSTRAINT "RetailOpsStaffProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStaffProfile" ADD CONSTRAINT "RetailOpsStaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStaffProfile" ADD CONSTRAINT "RetailOpsStaffProfile_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStaffProfile" ADD CONSTRAINT "RetailOpsStaffProfile_defaultStoreId_fkey" FOREIGN KEY ("defaultStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStaffInviteToken" ADD CONSTRAINT "RetailOpsStaffInviteToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStaffInviteToken" ADD CONSTRAINT "RetailOpsStaffInviteToken_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStaffLifecycleEvent" ADD CONSTRAINT "RetailOpsStaffLifecycleEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStaffLifecycleEvent" ADD CONSTRAINT "RetailOpsStaffLifecycleEvent_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStaffLifecycleEvent" ADD CONSTRAINT "RetailOpsStaffLifecycleEvent_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "RetailOpsStaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
