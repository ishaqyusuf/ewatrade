-- AlterTable
ALTER TABLE "FinanceBill" ADD COLUMN     "voidEffectiveAt" TIMESTAMP(3),
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "FinanceBillPayment" ADD COLUMN     "reversalEffectiveAt" TIMESTAMP(3),
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT;
