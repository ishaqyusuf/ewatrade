-- CreateEnum
CREATE TYPE "ServiceCommerceStoreTeamCapability" AS ENUM ('ATTENDANT', 'QUOTE_APPROVER');

-- CreateEnum
CREATE TYPE "ServiceCommerceStoreTeamAssignmentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ServiceCommerceStoreTeamAuditEventType" AS ENUM ('ASSIGNED', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CustomerEntryPointStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CustomerEntryPointAuditEventType" AS ENUM ('PUBLISHED', 'REPUBLISHED', 'REVOKED');

-- CreateTable
CREATE TABLE "ServiceCommerceStoreTeamAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "capability" "ServiceCommerceStoreTeamCapability" NOT NULL,
    "status" "ServiceCommerceStoreTeamAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "assignedByUserId" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "suspendedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCommerceStoreTeamAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceStoreTeamAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "subjectMembershipId" TEXT NOT NULL,
    "type" "ServiceCommerceStoreTeamAuditEventType" NOT NULL,
    "reason" TEXT NOT NULL,
    "assignmentRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceStoreTeamAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerEntryPoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "publicTokenDigest" TEXT NOT NULL,
    "status" "CustomerEntryPointStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerEntryPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerEntryPointAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "entryPointId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" "CustomerEntryPointAuditEventType" NOT NULL,
    "entryPointRevision" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerEntryPointAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCommerceStoreTeamAssignment_tenantId_storeId_capabil_idx" ON "ServiceCommerceStoreTeamAssignment"("tenantId", "storeId", "capability", "status");

-- CreateIndex
CREATE INDEX "ServiceCommerceStoreTeamAssignment_membershipId_status_idx" ON "ServiceCommerceStoreTeamAssignment"("membershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceStoreTeamAssignment_storeId_membershipId_cap_key" ON "ServiceCommerceStoreTeamAssignment"("storeId", "membershipId", "capability");

-- CreateIndex
CREATE INDEX "ServiceCommerceStoreTeamAuditEvent_tenantId_storeId_created_idx" ON "ServiceCommerceStoreTeamAuditEvent"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceStoreTeamAuditEvent_assignmentId_createdAt_idx" ON "ServiceCommerceStoreTeamAuditEvent"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceStoreTeamAuditEvent_actorUserId_createdAt_idx" ON "ServiceCommerceStoreTeamAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEntryPoint_storeId_key" ON "CustomerEntryPoint"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEntryPoint_publicToken_key" ON "CustomerEntryPoint"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEntryPoint_publicTokenDigest_key" ON "CustomerEntryPoint"("publicTokenDigest");

-- CreateIndex
CREATE INDEX "CustomerEntryPoint_tenantId_status_updatedAt_idx" ON "CustomerEntryPoint"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CustomerEntryPointAuditEvent_tenantId_storeId_createdAt_idx" ON "CustomerEntryPointAuditEvent"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerEntryPointAuditEvent_entryPointId_createdAt_idx" ON "CustomerEntryPointAuditEvent"("entryPointId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerEntryPointAuditEvent_actorUserId_createdAt_idx" ON "CustomerEntryPointAuditEvent"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreTeamAssignment" ADD CONSTRAINT "ServiceCommerceStoreTeamAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreTeamAssignment" ADD CONSTRAINT "ServiceCommerceStoreTeamAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreTeamAssignment" ADD CONSTRAINT "ServiceCommerceStoreTeamAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreTeamAuditEvent" ADD CONSTRAINT "ServiceCommerceStoreTeamAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreTeamAuditEvent" ADD CONSTRAINT "ServiceCommerceStoreTeamAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceStoreTeamAuditEvent" ADD CONSTRAINT "ServiceCommerceStoreTeamAuditEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ServiceCommerceStoreTeamAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEntryPoint" ADD CONSTRAINT "CustomerEntryPoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEntryPoint" ADD CONSTRAINT "CustomerEntryPoint_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEntryPointAuditEvent" ADD CONSTRAINT "CustomerEntryPointAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEntryPointAuditEvent" ADD CONSTRAINT "CustomerEntryPointAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEntryPointAuditEvent" ADD CONSTRAINT "CustomerEntryPointAuditEvent_entryPointId_fkey" FOREIGN KEY ("entryPointId") REFERENCES "CustomerEntryPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
