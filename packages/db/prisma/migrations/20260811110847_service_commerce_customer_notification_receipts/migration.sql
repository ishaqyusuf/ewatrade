-- AlterTable
ALTER TABLE "ServiceCommerceCustomerNotificationAttempt" ADD COLUMN     "providerConnectionId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceCommerceCustomerNotificationAttempt_tenantId_provide_idx" ON "ServiceCommerceCustomerNotificationAttempt"("tenantId", "providerConnectionId", "providerOperationId");
