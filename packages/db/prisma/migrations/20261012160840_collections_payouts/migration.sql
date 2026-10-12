-- CreateEnum
CREATE TYPE "CollectionProviderEventOutcome" AS ENUM ('RECEIVED', 'APPLIED', 'HELD', 'IGNORED', 'REJECTED');

-- CreateTable
CREATE TABLE "CollectionIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientIntentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "status" "HostedPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "checkoutUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionProviderEvent" (
    "id" TEXT NOT NULL,
    "intentId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currencyCode" TEXT,
    "outcome" "CollectionProviderEventOutcome" NOT NULL DEFAULT 'RECEIVED',
    "holdReason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "CollectionProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "refundCommandId" TEXT,
    "customerLedgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutBeneficiary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "country" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountSuffix" TEXT NOT NULL,
    "providerRecipientCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutBeneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "totalDebitMinor" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "reviewDigest" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "providerTransferCode" TEXT,
    "status" TEXT NOT NULL,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "submissionClaimedAt" TIMESTAMP(3),
    "draftedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT NOT NULL,
    "stepUpVerifiedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "postedJournalEntryId" TEXT,
    "correctionJournalEntryId" TEXT,

    CONSTRAINT "PayoutIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutProviderEvent" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outcome" "CollectionProviderEventOutcome" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPayoutSetting" (
    "tenantId" TEXT NOT NULL,
    "payoutsStopped" BOOLEAN NOT NULL DEFAULT false,
    "stoppedAt" TIMESTAMP(3),
    "stoppedByUserId" TEXT,
    "stopReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPayoutSetting_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionIntent_providerReference_key" ON "CollectionIntent"("providerReference");

-- CreateIndex
CREATE INDEX "CollectionIntent_orderId_status_expiresAt_idx" ON "CollectionIntent"("orderId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "CollectionIntent_tenantId_storeId_status_createdAt_idx" ON "CollectionIntent"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionIntent_tenantId_id_key" ON "CollectionIntent"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionIntent_tenantId_orderId_id_key" ON "CollectionIntent"("tenantId", "orderId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionIntent_tenantId_clientIntentId_key" ON "CollectionIntent"("tenantId", "clientIntentId");

-- CreateIndex
CREATE INDEX "CollectionProviderEvent_intentId_receivedAt_idx" ON "CollectionProviderEvent"("intentId", "receivedAt");

-- CreateIndex
CREATE INDEX "CollectionProviderEvent_provider_outcome_receivedAt_idx" ON "CollectionProviderEvent"("provider", "outcome", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionProviderEvent_intentId_id_key" ON "CollectionProviderEvent"("intentId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionProviderEvent_provider_providerEventId_key" ON "CollectionProviderEvent"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionHold_eventId_key" ON "CollectionHold"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionHold_refundCommandId_key" ON "CollectionHold"("refundCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionHold_customerLedgerEntryId_key" ON "CollectionHold"("customerLedgerEntryId");

-- CreateIndex
CREATE INDEX "CollectionHold_tenantId_resolvedAt_createdAt_idx" ON "CollectionHold"("tenantId", "resolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionHold_intentId_eventId_key" ON "CollectionHold"("intentId", "eventId");

-- CreateIndex
CREATE INDEX "PayoutBeneficiary_tenantId_supplierId_status_idx" ON "PayoutBeneficiary"("tenantId", "supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBeneficiary_bookId_supplierId_id_key" ON "PayoutBeneficiary"("bookId", "supplierId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBeneficiary_bookId_supplierId_version_key" ON "PayoutBeneficiary"("bookId", "supplierId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutIntent_providerReference_key" ON "PayoutIntent"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutIntent_postedJournalEntryId_key" ON "PayoutIntent"("postedJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutIntent_correctionJournalEntryId_key" ON "PayoutIntent"("correctionJournalEntryId");

-- CreateIndex
CREATE INDEX "PayoutIntent_tenantId_status_approvedAt_idx" ON "PayoutIntent"("tenantId", "status", "approvedAt");

-- CreateIndex
CREATE INDEX "PayoutIntent_billId_idx" ON "PayoutIntent"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutIntent_bookId_postedJournalEntryId_key" ON "PayoutIntent"("bookId", "postedJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutIntent_bookId_correctionJournalEntryId_key" ON "PayoutIntent"("bookId", "correctionJournalEntryId");

-- CreateIndex
CREATE INDEX "PayoutProviderEvent_payoutId_receivedAt_idx" ON "PayoutProviderEvent"("payoutId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutProviderEvent_provider_providerEventId_key" ON "PayoutProviderEvent"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "CollectionIntent" ADD CONSTRAINT "CollectionIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionIntent" ADD CONSTRAINT "CollectionIntent_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "Store"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionIntent" ADD CONSTRAINT "CollectionIntent_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "CommercialOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProviderEvent" ADD CONSTRAINT "CollectionProviderEvent_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "CollectionIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionHold" ADD CONSTRAINT "CollectionHold_tenantId_orderId_intentId_fkey" FOREIGN KEY ("tenantId", "orderId", "intentId") REFERENCES "CollectionIntent"("tenantId", "orderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionHold" ADD CONSTRAINT "CollectionHold_intentId_eventId_fkey" FOREIGN KEY ("intentId", "eventId") REFERENCES "CollectionProviderEvent"("intentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutBeneficiary" ADD CONSTRAINT "PayoutBeneficiary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutBeneficiary" ADD CONSTRAINT "PayoutBeneficiary_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutBeneficiary" ADD CONSTRAINT "PayoutBeneficiary_bookId_supplierId_fkey" FOREIGN KEY ("bookId", "supplierId") REFERENCES "FinanceSupplierAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutIntent" ADD CONSTRAINT "PayoutIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutIntent" ADD CONSTRAINT "PayoutIntent_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutIntent" ADD CONSTRAINT "PayoutIntent_bookId_supplierId_billId_fkey" FOREIGN KEY ("bookId", "supplierId", "billId") REFERENCES "FinanceBill"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutIntent" ADD CONSTRAINT "PayoutIntent_bookId_debitAccountId_fkey" FOREIGN KEY ("bookId", "debitAccountId") REFERENCES "FinanceAccount"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutIntent" ADD CONSTRAINT "PayoutIntent_bookId_supplierId_beneficiaryId_fkey" FOREIGN KEY ("bookId", "supplierId", "beneficiaryId") REFERENCES "PayoutBeneficiary"("bookId", "supplierId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutIntent" ADD CONSTRAINT "PayoutIntent_bookId_postedJournalEntryId_fkey" FOREIGN KEY ("bookId", "postedJournalEntryId") REFERENCES "FinanceJournalEntry"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutIntent" ADD CONSTRAINT "PayoutIntent_bookId_correctionJournalEntryId_fkey" FOREIGN KEY ("bookId", "correctionJournalEntryId") REFERENCES "FinanceJournalEntry"("bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutProviderEvent" ADD CONSTRAINT "PayoutProviderEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "PayoutIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPayoutSetting" ADD CONSTRAINT "BusinessPayoutSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
