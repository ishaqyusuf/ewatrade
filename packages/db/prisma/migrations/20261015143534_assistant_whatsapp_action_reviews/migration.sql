-- AlterEnum
ALTER TYPE "AssistantWhatsAppInboxKind" ADD VALUE 'ACTION';

-- CreateTable
CREATE TABLE "AssistantWhatsAppActionReview" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "proposalRevision" INTEGER NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "targetRevision" TEXT,
    "reviewDigest" TEXT NOT NULL,
    "authorityDigest" TEXT NOT NULL,
    "identityGeneration" INTEGER NOT NULL,
    "grantGeneration" INTEGER NOT NULL,
    "selectionGeneration" INTEGER NOT NULL,
    "nonce" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "confirmDigest" TEXT NOT NULL,
    "cancelDigest" TEXT NOT NULL,
    "reviewOutboxId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "consumedByIngressId" TEXT,
    "decision" TEXT,
    "resultRef" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantWhatsAppActionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppActionReview_nonce_key" ON "AssistantWhatsAppActionReview"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppActionReview_confirmDigest_key" ON "AssistantWhatsAppActionReview"("confirmDigest");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppActionReview_cancelDigest_key" ON "AssistantWhatsAppActionReview"("cancelDigest");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppActionReview_reviewOutboxId_key" ON "AssistantWhatsAppActionReview"("reviewOutboxId");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppActionReview_proposalId_proposalRevision_s_idx" ON "AssistantWhatsAppActionReview"("proposalId", "proposalRevision", "state");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppActionReview_bindingId_state_expiresAt_idx" ON "AssistantWhatsAppActionReview"("bindingId", "state", "expiresAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppActionReview_expiresAt_idx" ON "AssistantWhatsAppActionReview"("expiresAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppActionReview_consumedByIngressId_idx" ON "AssistantWhatsAppActionReview"("consumedByIngressId");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppActionReview" ADD CONSTRAINT "AssistantWhatsAppActionReview_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "AssistantWhatsAppBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppActionReview" ADD CONSTRAINT "AssistantWhatsAppActionReview_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AssistantActionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppActionReview" ADD CONSTRAINT "AssistantWhatsAppActionReview_reviewOutboxId_fkey" FOREIGN KEY ("reviewOutboxId") REFERENCES "AssistantWhatsAppOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
