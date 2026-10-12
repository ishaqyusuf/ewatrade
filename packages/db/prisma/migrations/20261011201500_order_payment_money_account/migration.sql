-- AlterTable
ALTER TABLE "CommercialOrderPayment" ADD COLUMN     "moneyAccountId" TEXT;

-- AddForeignKey
ALTER TABLE "CommercialOrderPayment" ADD CONSTRAINT "CommercialOrderPayment_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
