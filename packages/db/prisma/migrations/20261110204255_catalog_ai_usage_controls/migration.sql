-- AlterTable
ALTER TABLE "CatalogAiImageJob" ADD COLUMN     "reconciliation" JSONB;

-- CreateTable
CREATE TABLE "AssistantWhatsAppMonthlyUsage" (
    "tenantId" TEXT NOT NULL,
    "monthStartedAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantWhatsAppMonthlyUsage_pkey" PRIMARY KEY ("tenantId","monthStartedAt")
);

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppMonthlyUsage" ADD CONSTRAINT "AssistantWhatsAppMonthlyUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
