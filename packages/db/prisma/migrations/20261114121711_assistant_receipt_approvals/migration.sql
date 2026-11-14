-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssistantReceiptReadStatus" ADD VALUE 'APPROVAL_OFFERED';
ALTER TYPE "AssistantReceiptReadStatus" ADD VALUE 'APPROVAL_PENDING';
ALTER TYPE "AssistantReceiptReadStatus" ADD VALUE 'APPROVED';
ALTER TYPE "AssistantReceiptReadStatus" ADD VALUE 'DECLINED';
ALTER TYPE "AssistantReceiptReadStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "AssistantReceiptRead" ADD COLUMN     "approvalAction" JSONB,
ADD COLUMN     "approvalDecidedAt" TIMESTAMP(3),
ADD COLUMN     "approvalDecidedByUserId" TEXT,
ADD COLUMN     "approvalExpiresAt" TIMESTAMP(3),
ADD COLUMN     "approvalNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "approvalRequestedAt" TIMESTAMP(3),
ADD COLUMN     "approvalSummary" TEXT;

-- CreateIndex
CREATE INDEX "AssistantReceiptRead_tenantId_storeId_status_approvalExpire_idx" ON "AssistantReceiptRead"("tenantId", "storeId", "status", "approvalExpiresAt");
