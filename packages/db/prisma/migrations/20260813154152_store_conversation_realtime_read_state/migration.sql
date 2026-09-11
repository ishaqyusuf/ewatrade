-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'CUSTOMER_PROGRESS_ACKNOWLEDGED';
ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'STAFF_READ_ACKNOWLEDGED';

-- CreateTable
CREATE TABLE "StoreConversationCustomerWatermark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "deliveredThroughSequence" INTEGER NOT NULL DEFAULT 0,
    "readThroughSequence" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationCustomerWatermark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConversationStaffWatermark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "readThroughSequence" INTEGER NOT NULL DEFAULT 0,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConversationStaffWatermark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreConversationCustomerWatermark_tenantId_storeId_convers_idx" ON "StoreConversationCustomerWatermark"("tenantId", "storeId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationCustomerWatermark_conversationId_credentia_key" ON "StoreConversationCustomerWatermark"("conversationId", "credentialId");

-- CreateIndex
CREATE INDEX "StoreConversationStaffWatermark_tenantId_storeId_conversati_idx" ON "StoreConversationStaffWatermark"("tenantId", "storeId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationStaffWatermark_conversationId_membershipId_key" ON "StoreConversationStaffWatermark"("conversationId", "membershipId");

-- AddForeignKey
ALTER TABLE "StoreConversationCustomerWatermark" ADD CONSTRAINT "StoreConversationCustomerWatermark_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationCustomerWatermark" ADD CONSTRAINT "StoreConversationCustomerWatermark_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationCustomerWatermark" ADD CONSTRAINT "StoreConversationCustomerWatermark_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationCustomerWatermark" ADD CONSTRAINT "StoreConversationCustomerWatermark_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationStaffWatermark" ADD CONSTRAINT "StoreConversationStaffWatermark_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationStaffWatermark" ADD CONSTRAINT "StoreConversationStaffWatermark_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationStaffWatermark" ADD CONSTRAINT "StoreConversationStaffWatermark_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationStaffWatermark" ADD CONSTRAINT "StoreConversationStaffWatermark_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
