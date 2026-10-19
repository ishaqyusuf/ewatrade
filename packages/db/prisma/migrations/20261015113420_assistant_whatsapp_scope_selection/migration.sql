-- CreateTable
CREATE TABLE "AssistantWhatsAppSelection" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "operationDigest" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantWhatsAppSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppSelection_operationDigest_key" ON "AssistantWhatsAppSelection"("operationDigest");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppSelection_identityId_createdAt_idx" ON "AssistantWhatsAppSelection"("identityId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppSelection" ADD CONSTRAINT "AssistantWhatsAppSelection_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "AssistantWhatsAppIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
