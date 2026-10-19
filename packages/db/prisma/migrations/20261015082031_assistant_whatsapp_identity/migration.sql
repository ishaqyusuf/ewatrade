-- CreateTable
CREATE TABLE "AssistantWhatsAppIdentity" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantWhatsAppIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantWhatsAppLink" (
    "id" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "claimedSenderId" TEXT,
    "claimedMessageId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantWhatsAppLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantWhatsAppGrant" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantWhatsAppGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantWhatsAppIdentity_userId_revokedAt_idx" ON "AssistantWhatsAppIdentity"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppIdentity_phoneNumberId_senderId_key" ON "AssistantWhatsAppIdentity"("phoneNumberId", "senderId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppLink_tokenDigest_key" ON "AssistantWhatsAppLink"("tokenDigest");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppLink_userId_createdAt_idx" ON "AssistantWhatsAppLink"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppLink_expiresAt_idx" ON "AssistantWhatsAppLink"("expiresAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppGrant_membershipId_revokedAt_idx" ON "AssistantWhatsAppGrant"("membershipId", "revokedAt");

-- CreateIndex
CREATE INDEX "AssistantWhatsAppGrant_expiresAt_idx" ON "AssistantWhatsAppGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppGrant_identityId_tenantId_key" ON "AssistantWhatsAppGrant"("identityId", "tenantId");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppIdentity" ADD CONSTRAINT "AssistantWhatsAppIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppLink" ADD CONSTRAINT "AssistantWhatsAppLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppLink" ADD CONSTRAINT "AssistantWhatsAppLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppLink" ADD CONSTRAINT "AssistantWhatsAppLink_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "Store"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppLink" ADD CONSTRAINT "AssistantWhatsAppLink_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppGrant" ADD CONSTRAINT "AssistantWhatsAppGrant_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "AssistantWhatsAppIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppGrant" ADD CONSTRAINT "AssistantWhatsAppGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppGrant" ADD CONSTRAINT "AssistantWhatsAppGrant_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "Store"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppGrant" ADD CONSTRAINT "AssistantWhatsAppGrant_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
