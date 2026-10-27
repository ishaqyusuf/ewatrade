-- CreateTable
CREATE TABLE "ManualPaymentAlertSetting" (
    "accountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "channel" TEXT NOT NULL,
    "effectiveChannel" TEXT,
    "recipientUserIds" TEXT[],
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualPaymentAlertSetting_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "PaymentNotificationPolicyCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentNotificationPolicyCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentNotificationPolicyChange" (
    "revision" INTEGER NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cursor" TEXT,
    "claimId" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentNotificationPolicyChange_pkey" PRIMARY KEY ("revision")
);

-- CreateTable
CREATE TABLE "PaymentNotificationQuota" (
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentNotificationQuota_pkey" PRIMARY KEY ("tenantId","channel","periodStart")
);

-- CreateTable
CREATE TABLE "PaymentNotificationIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "policyRevision" INTEGER NOT NULL,
    "settingRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "claimId" TEXT,
    "sendStartedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentNotificationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentNotificationNotice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyRevision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "accountIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentNotificationNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentNotificationNoticeRead" (
    "noticeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentNotificationNoticeRead_pkey" PRIMARY KEY ("noticeId","membershipId")
);

-- CreateIndex
CREATE INDEX "ManualPaymentAlertSetting_tenantId_idx" ON "ManualPaymentAlertSetting"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentNotificationPolicyChange_status_revision_idx" ON "PaymentNotificationPolicyChange"("status", "revision");

-- CreateIndex
CREATE INDEX "PaymentNotificationIntent_tenantId_channel_periodStart_idx" ON "PaymentNotificationIntent"("tenantId", "channel", "periodStart");

-- CreateIndex
CREATE INDEX "PaymentNotificationIntent_status_createdAt_idx" ON "PaymentNotificationIntent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentNotificationIntent_tenantId_reportId_recipientUserId_key" ON "PaymentNotificationIntent"("tenantId", "reportId", "recipientUserId");

-- CreateIndex
CREATE INDEX "PaymentNotificationNotice_tenantId_createdAt_id_idx" ON "PaymentNotificationNotice"("tenantId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentNotificationNotice_tenantId_id_key" ON "PaymentNotificationNotice"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentNotificationNotice_tenantId_policyRevision_key" ON "PaymentNotificationNotice"("tenantId", "policyRevision");

-- AddForeignKey
ALTER TABLE "ManualPaymentAlertSetting" ADD CONSTRAINT "ManualPaymentAlertSetting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentAlertSetting" ADD CONSTRAINT "ManualPaymentAlertSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotificationQuota" ADD CONSTRAINT "PaymentNotificationQuota_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotificationIntent" ADD CONSTRAINT "PaymentNotificationIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotificationIntent" ADD CONSTRAINT "PaymentNotificationIntent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ManualPaymentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotificationIntent" ADD CONSTRAINT "PaymentNotificationIntent_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotificationNotice" ADD CONSTRAINT "PaymentNotificationNotice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotificationNoticeRead" ADD CONSTRAINT "PaymentNotificationNoticeRead_tenantId_noticeId_fkey" FOREIGN KEY ("tenantId", "noticeId") REFERENCES "PaymentNotificationNotice"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotificationNoticeRead" ADD CONSTRAINT "PaymentNotificationNoticeRead_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
