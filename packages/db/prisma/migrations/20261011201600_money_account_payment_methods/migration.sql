-- AlterTable
ALTER TABLE "FinanceAccount" ADD COLUMN     "paymentMethods" "CommercialPaymentMethod"[] DEFAULT ARRAY[]::"CommercialPaymentMethod"[],
ADD COLUMN     "paymentsPausedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FinanceMoneyAccountPaymentEvent" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "paymentMethods" "CommercialPaymentMethod"[],
    "paused" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceMoneyAccountPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceMoneyAccountPaymentEvent_accountId_createdAt_idx" ON "FinanceMoneyAccountPaymentEvent"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "FinanceMoneyAccountPaymentEvent" ADD CONSTRAINT "FinanceMoneyAccountPaymentEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
