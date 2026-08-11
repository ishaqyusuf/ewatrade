-- CreateEnum
CREATE TYPE "ServiceCommerceQuoteReleaseMode" AS ENUM ('ATTENDANT_CAN_RELEASE', 'APPROVAL_REQUIRED');

-- CreateEnum
CREATE TYPE "ServiceCommerceQuoteApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ServiceCommerceQuoteApprovalAuditEventType" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "ServiceCommerceQuoteReleasePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mode" "ServiceCommerceQuoteReleaseMode" NOT NULL DEFAULT 'ATTENDANT_CAN_RELEASE',
    "selectedApproverMembershipIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCommerceQuoteReleasePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceQuoteReleaseCommandReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "policyRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceQuoteReleaseCommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceQuoteReleasePolicyAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromMode" "ServiceCommerceQuoteReleaseMode",
    "toMode" "ServiceCommerceQuoteReleaseMode" NOT NULL,
    "selectedApproverMembershipIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "policyRevision" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceQuoteReleasePolicyAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceQuoteApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "sourceType" "CommerceQuoteSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "ServiceCommerceQuoteApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requesterMembershipId" TEXT NOT NULL,
    "decidedByMembershipId" TEXT,
    "decisionClientId" TEXT,
    "decisionPayloadHash" TEXT,
    "policyRevision" INTEGER NOT NULL,
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCommerceQuoteApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCommerceQuoteApprovalAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "type" "ServiceCommerceQuoteApprovalAuditEventType" NOT NULL,
    "approvalStatus" "ServiceCommerceQuoteApprovalStatus" NOT NULL,
    "policyRevision" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCommerceQuoteApprovalAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceQuoteReleasePolicy_storeId_key" ON "ServiceCommerceQuoteReleasePolicy"("storeId");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteReleasePolicy_tenantId_mode_updatedAt_idx" ON "ServiceCommerceQuoteReleasePolicy"("tenantId", "mode", "updatedAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteReleaseCommandReceipt_storeId_createdAt_idx" ON "ServiceCommerceQuoteReleaseCommandReceipt"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteReleaseCommandReceipt_policyId_createdA_idx" ON "ServiceCommerceQuoteReleaseCommandReceipt"("policyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceQuoteReleaseCommandReceipt_tenantId_clientOp_key" ON "ServiceCommerceQuoteReleaseCommandReceipt"("tenantId", "clientOperationId");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteReleasePolicyAuditEvent_tenantId_storeI_idx" ON "ServiceCommerceQuoteReleasePolicyAuditEvent"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteReleasePolicyAuditEvent_policyId_create_idx" ON "ServiceCommerceQuoteReleasePolicyAuditEvent"("policyId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteReleasePolicyAuditEvent_actorUserId_cre_idx" ON "ServiceCommerceQuoteReleasePolicyAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceQuoteApproval_quoteVersionId_key" ON "ServiceCommerceQuoteApproval"("quoteVersionId");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteApproval_tenantId_storeId_status_reques_idx" ON "ServiceCommerceQuoteApproval"("tenantId", "storeId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteApproval_quoteId_status_idx" ON "ServiceCommerceQuoteApproval"("quoteId", "status");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteApproval_requesterMembershipId_requeste_idx" ON "ServiceCommerceQuoteApproval"("requesterMembershipId", "requestedAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteApproval_decidedByMembershipId_decidedA_idx" ON "ServiceCommerceQuoteApproval"("decidedByMembershipId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCommerceQuoteApproval_tenantId_storeId_quoteVersionI_key" ON "ServiceCommerceQuoteApproval"("tenantId", "storeId", "quoteVersionId");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteApprovalAuditEvent_tenantId_storeId_cre_idx" ON "ServiceCommerceQuoteApprovalAuditEvent"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteApprovalAuditEvent_approvalId_createdAt_idx" ON "ServiceCommerceQuoteApprovalAuditEvent"("approvalId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCommerceQuoteApprovalAuditEvent_actorMembershipId_cr_idx" ON "ServiceCommerceQuoteApprovalAuditEvent"("actorMembershipId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteReleasePolicy" ADD CONSTRAINT "ServiceCommerceQuoteReleasePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteReleasePolicy" ADD CONSTRAINT "ServiceCommerceQuoteReleasePolicy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteReleaseCommandReceipt" ADD CONSTRAINT "ServiceCommerceQuoteReleaseCommandReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteReleaseCommandReceipt" ADD CONSTRAINT "ServiceCommerceQuoteReleaseCommandReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteReleaseCommandReceipt" ADD CONSTRAINT "ServiceCommerceQuoteReleaseCommandReceipt_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ServiceCommerceQuoteReleasePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteReleasePolicyAuditEvent" ADD CONSTRAINT "ServiceCommerceQuoteReleasePolicyAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteReleasePolicyAuditEvent" ADD CONSTRAINT "ServiceCommerceQuoteReleasePolicyAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteReleasePolicyAuditEvent" ADD CONSTRAINT "ServiceCommerceQuoteReleasePolicyAuditEvent_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ServiceCommerceQuoteReleasePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApproval" ADD CONSTRAINT "ServiceCommerceQuoteApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApproval" ADD CONSTRAINT "ServiceCommerceQuoteApproval_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApproval" ADD CONSTRAINT "ServiceCommerceQuoteApproval_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "CommerceQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApproval" ADD CONSTRAINT "ServiceCommerceQuoteApproval_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApproval" ADD CONSTRAINT "ServiceCommerceQuoteApproval_requesterMembershipId_fkey" FOREIGN KEY ("requesterMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApproval" ADD CONSTRAINT "ServiceCommerceQuoteApproval_decidedByMembershipId_fkey" FOREIGN KEY ("decidedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApprovalAuditEvent" ADD CONSTRAINT "ServiceCommerceQuoteApprovalAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApprovalAuditEvent" ADD CONSTRAINT "ServiceCommerceQuoteApprovalAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApprovalAuditEvent" ADD CONSTRAINT "ServiceCommerceQuoteApprovalAuditEvent_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ServiceCommerceQuoteApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommerceQuoteApprovalAuditEvent" ADD CONSTRAINT "ServiceCommerceQuoteApprovalAuditEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
