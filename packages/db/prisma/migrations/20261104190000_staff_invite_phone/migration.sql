-- AlterTable
ALTER TABLE "RetailOpsStaffInviteToken" ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE INDEX "RetailOpsStaffInviteToken_phone_status_idx" ON "RetailOpsStaffInviteToken"("phone", "status");
