import { createFinanceExpenseReceiptThumbnailRepository } from "@ewatrade/db/finance-expense-receipt-delivery"
import {
  attachFinanceExpenseReceipt,
  createFinanceExpenseReceipt,
  getFinanceExpenseReceipt,
  listFinanceExpenseReceipts,
  withdrawFinanceExpenseReceipt,
} from "@ewatrade/db/queries"
import { financeExpenseReceiptDeliveryStorage } from "../../finance/expense-receipt-delivery-context"
import { makeFinanceExpenseReceiptThumbnail } from "../../finance/expense-receipt-thumbnail-workflow"
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
    .mutation(async ({ ctx, input }) => {
      const attached = await attachFinanceExpenseReceipt(ctx.db, {
        ...input,
        ...ctx.financeActor,
      })
      // ADR-0051: make the private thumbnail now, best effort and bounded. No
      // bytes leave here; the thumbnail route re-checks the live session.
      await makeFinanceExpenseReceiptThumbnail({
        repository: createFinanceExpenseReceiptThumbnailRepository(ctx.db, {
          tenantId: ctx.financeActor.tenantId,
          actorUserId: ctx.financeActor.actorUserId,
          bookId: input.bookId,
          billId: input.billId,
          assetId: input.assetId,
        }),
        checkSession: async () => {},
        storage: financeExpenseReceiptDeliveryStorage,
        signal: AbortSignal.timeout(20_000),
      })
      return attached
    }),
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
