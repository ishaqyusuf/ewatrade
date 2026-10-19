-- CreateTable
CREATE TABLE "AssistantWhatsAppWorkflowReview" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftRevision" INTEGER NOT NULL,
    "source" JSONB NOT NULL,
    "sourceDigest" TEXT NOT NULL,
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

    CONSTRAINT "AssistantWhatsAppWorkflowReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppWorkflowReview_nonce_key" ON "AssistantWhatsAppWorkflowReview"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppWorkflowReview_confirmDigest_key" ON "AssistantWhatsAppWorkflowReview"("confirmDigest");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppWorkflowReview_cancelDigest_key" ON "AssistantWhatsAppWorkflowReview"("cancelDigest");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppWorkflowReview_reviewOutboxId_key" ON "AssistantWhatsAppWorkflowReview"("reviewOutboxId");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppWorkflowReview_bindingId_state_expiresAt_idx" ON "AssistantWhatsAppWorkflowReview"("bindingId", "state", "expiresAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppWorkflowReview_conversationId_draftRevisio_idx" ON "AssistantWhatsAppWorkflowReview"("conversationId", "draftRevision", "state");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppWorkflowReview_expiresAt_idx" ON "AssistantWhatsAppWorkflowReview"("expiresAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppWorkflowReview_consumedByIngressId_idx" ON "AssistantWhatsAppWorkflowReview"("consumedByIngressId");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppWorkflowReview" ADD CONSTRAINT "AssistantWhatsAppWorkflowReview_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "AssistantWhatsAppBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppWorkflowReview" ADD CONSTRAINT "AssistantWhatsAppWorkflowReview_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppWorkflowReview" ADD CONSTRAINT "AssistantWhatsAppWorkflowReview_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SetupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppWorkflowReview" ADD CONSTRAINT "AssistantWhatsAppWorkflowReview_reviewOutboxId_fkey" FOREIGN KEY ("reviewOutboxId") REFERENCES "AssistantWhatsAppOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
