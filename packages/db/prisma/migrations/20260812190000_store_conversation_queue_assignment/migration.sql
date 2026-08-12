-- CreateEnum
CREATE TYPE "StoreConversationEscalationKind" AS ENUM ('UNCLAIMED', 'OVERDUE', 'ABANDONED', 'FAILED_RESPONSE', 'MEMBERSHIP_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "StoreConversationEscalationEventType" AS ENUM ('OPENED', 'RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StoreConversationAssignmentEventType" ADD VALUE 'HANDED_OFF';
ALTER TYPE "StoreConversationAssignmentEventType" ADD VALUE 'MEMBERSHIP_RELEASED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'RELEASED';
ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'HANDED_OFF';
ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'REASSIGNED';
ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'STAFF_TIMELINE_READ';
ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'ESCALATED';
ALTER TYPE "StoreConversationAuditEventType" ADD VALUE 'ESCALATION_RESOLVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'RELEASE';
ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'HANDOFF';
ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'REASSIGN';
ALTER TYPE "StoreConversationCommandKind" ADD VALUE 'ESCALATION_RESOLVED';

-- AlterTable
ALTER TABLE "StoreConversation" ADD COLUMN     "lastCustomerMessageAt" TIMESTAMP(3),
ADD COLUMN     "lastCustomerMessageSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastStoreReplyAt" TIMESTAMP(3),
ADD COLUMN     "lastStoreReplySequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "responseDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StoreConversationAssignmentEvent" ADD COLUMN     "actorKind" "StoreConversationMessageAuthorKind" NOT NULL DEFAULT 'STORE_ATTENDANT',
ALTER COLUMN "actorMembershipId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StoreConversationCommandReceipt" ADD COLUMN     "assignmentMembershipId" TEXT,
ADD COLUMN     "assignmentRevision" INTEGER;

-- CreateTable
CREATE TABLE "StoreConversationEscalationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorMembershipId" TEXT,
    "kind" "StoreConversationEscalationKind" NOT NULL,
    "type" "StoreConversationEscalationEventType" NOT NULL,
    "assignmentRevision" INTEGER NOT NULL,
    "conversationSequence" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationEscalationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationEscalationEvent_dedupeKey_key" ON "StoreConversationEscalationEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "StoreConversationEscalationEvent_tenantId_storeId_occurredA_idx" ON "StoreConversationEscalationEvent"("tenantId", "storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversationEscalationEvent_conversationId_kind_occurr_idx" ON "StoreConversationEscalationEvent"("conversationId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreConversation_tenantId_storeId_lifecycle_responseDueAt_idx" ON "StoreConversation"("tenantId", "storeId", "lifecycle", "responseDueAt");

-- AddForeignKey
ALTER TABLE "StoreConversationEscalationEvent" ADD CONSTRAINT "StoreConversationEscalationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationEscalationEvent" ADD CONSTRAINT "StoreConversationEscalationEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationEscalationEvent" ADD CONSTRAINT "StoreConversationEscalationEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "StoreConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationEscalationEvent" ADD CONSTRAINT "StoreConversationEscalationEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
