/*
  Warnings:

  - A unique constraint covering the columns `[id,tenantId]` on the table `Membership` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,tenantId]` on the table `Store` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StaffAccessMode" AS ENUM ('LEGACY', 'SCOPED');

-- CreateEnum
CREATE TYPE "StoreStaffRole" AS ENUM ('CASHIER', 'OPERATOR', 'MANAGER');

-- CreateEnum
CREATE TYPE "StaffStoreAssignmentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "catalogEditor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staffAccessMode" "StaffAccessMode" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "staffAccessRevision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "StaffStoreAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "role" "StoreStaffRole" NOT NULL,
    "status" "StaffStoreAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffStoreAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAccessAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAccessAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffStoreAssignment_tenantId_storeId_status_idx" ON "StaffStoreAssignment"("tenantId", "storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffStoreAssignment_membershipId_storeId_key" ON "StaffStoreAssignment"("membershipId", "storeId");

-- CreateIndex
CREATE INDEX "StaffAccessAuditEvent_tenantId_createdAt_idx" ON "StaffAccessAuditEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccessAuditEvent_membershipId_revision_key" ON "StaffAccessAuditEvent"("membershipId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_tenantId_key" ON "Membership"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_id_tenantId_key" ON "Store"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "StaffStoreAssignment" ADD CONSTRAINT "StaffStoreAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffStoreAssignment" ADD CONSTRAINT "StaffStoreAssignment_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffStoreAssignment" ADD CONSTRAINT "StaffStoreAssignment_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "Store"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccessAuditEvent" ADD CONSTRAINT "StaffAccessAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccessAuditEvent" ADD CONSTRAINT "StaffAccessAuditEvent_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
