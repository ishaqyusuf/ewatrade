import {
  attachFinanceExpenseReceipt,
  createFinanceExpenseReceipt,
  getFinanceExpenseReceipt,
  listFinanceExpenseReceipts,
  withdrawFinanceExpenseReceipt,
} from "@ewatrade/db/queries"
import {
  financeExpenseReceiptAssetSchema,
  financeExpenseReceiptAttachSchema,
  financeExpenseReceiptIntentSchema,
  financeExpenseReceiptListSchema,
} from "../../schemas/finance-expense-receipts"
import { financeProcedure } from "../finance-procedure"
import { createTRPCRouter } from "../init"

export const financeExpenseReceiptsRouter = createTRPCRouter({
  attach: financeProcedure
    .input(financeExpenseReceiptAttachSchema)
    .mutation(({ ctx, input }) =>
      attachFinanceExpenseReceipt(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  withdraw: financeProcedure
    .input(financeExpenseReceiptAttachSchema)
    .mutation(({ ctx, input }) =>
      withdrawFinanceExpenseReceipt(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  createIntent: financeProcedure
    .input(financeExpenseReceiptIntentSchema)
    .mutation(({ ctx, input }) =>
      createFinanceExpenseReceipt(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  get: financeProcedure
    .input(financeExpenseReceiptAssetSchema)
    .query(({ ctx, input }) =>
      getFinanceExpenseReceipt(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  list: financeProcedure
    .input(financeExpenseReceiptListSchema)
    .query(({ ctx, input }) =>
      listFinanceExpenseReceipts(ctx.db, { ...input, ...ctx.financeActor }),
    ),
})
