import {
  applyCustomerLedgerCredit,
  cancelCustomerFundsRefund,
  completeCustomerFundsRefund,
  encryptCustomerRefundDestination,
  ensureCustomerLedgerAccount,
  getCustomerFundsRefundDetail,
  getCustomerLedgerAccountDetail,
  getCustomerLedgerAllocationHistory,
  getCustomerLedgerCommandStatus,
  getCustomerLedgerEntryDetail,
  getCustomerLedgerStatement,
  getCustomerOrderReturnReview,
  listCustomerFundsRefunds,
  listCustomerLedgerAccounts,
  listCustomerLedgerReceivables,
  listCustomerLedgerSources,
  recordCustomerLedgerOpening,
  recordCustomerLedgerReceipt,
  recordCustomerLedgerReceiptAndApply,
  refundCustomerLedgerCredit,
  releaseCustomerLedgerAllocation,
  requestCustomerFundsRefund,
  requestCustomerFundsRefundDetails,
  reserveCustomerFundsRefund,
  returnCustomerOrderFunds,
  reverseCustomerLedgerEntry,
} from "@ewatrade/db/queries"
import {
  customerFundsRefundChangeSchema,
  customerFundsRefundCompleteSchema,
  customerFundsRefundDetailSchema,
  customerFundsRefundListSchema,
  customerFundsRefundNeedDetailsSchema,
  customerFundsRefundRequestSchema,
  customerFundsRefundReserveSchema,
  customerLedgerAccountDetailSchema,
  customerLedgerAccountsSchema,
  customerLedgerAllocationHistorySchema,
  customerLedgerApplyCreditSchema,
  customerLedgerCommandStatusSchema,
  customerLedgerEnsureAccountSchema,
  customerLedgerEntryDetailSchema,
  customerLedgerOpeningSchema,
  customerLedgerReceiptSchema,
  customerLedgerReceivablesSchema,
  customerLedgerRefundCreditSchema,
  customerLedgerReleaseAllocationSchema,
  customerLedgerReverseEntrySchema,
  customerLedgerSourcesSchema,
  customerLedgerStatementSchema,
  customerOrderFundsReturnSchema,
  customerOrderReturnReviewSchema,
} from "../../schemas/customer-ledger"
import { financeProcedure } from "../finance-procedure"
import { createTRPCRouter } from "../init"

// A missing destination key preserves safe request reads/cancellation.
// Approvals require the exact available destination; new custody requires a dedicated key.
const destinationKey = () => process.env.CUSTOMER_FUNDS_DESTINATION_KEY ?? ""

export const customerLedgerRouter = createTRPCRouter({
  refundRequests: financeProcedure
    .input(customerFundsRefundListSchema)
    .query(({ ctx, input }) =>
      listCustomerFundsRefunds(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  refundRequestDetail: financeProcedure
    .input(customerFundsRefundDetailSchema)
    .query(({ ctx, input }) =>
      getCustomerFundsRefundDetail(
        ctx.db,
        { ...input, ...ctx.financeActor },
        destinationKey(),
      ),
    ),
  requestRefund: financeProcedure
    .input(customerFundsRefundRequestSchema)
    .mutation(({ ctx, input }) => {
      const { destination, ...command } = input
      const encrypted = encryptCustomerRefundDestination(
        destination,
        { ...ctx.financeActor, ...command },
        destinationKey(),
      )
      return requestCustomerFundsRefund(ctx.db, {
        ...command,
        ...ctx.financeActor,
        ...encrypted,
      })
    }),
  reserveRefund: financeProcedure
    .input(customerFundsRefundReserveSchema)
    .mutation(({ ctx, input }) =>
      reserveCustomerFundsRefund(
        ctx.db,
        { ...input, ...ctx.financeActor },
        destinationKey(),
      ),
    ),
  cancelRefund: financeProcedure
    .input(customerFundsRefundChangeSchema)
    .mutation(({ ctx, input }) =>
      cancelCustomerFundsRefund(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  completeRefund: financeProcedure
    .input(customerFundsRefundCompleteSchema)
    .mutation(({ ctx, input }) =>
      completeCustomerFundsRefund(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  requestRefundDetails: financeProcedure
    .input(customerFundsRefundNeedDetailsSchema)
    .mutation(({ ctx, input }) =>
      requestCustomerFundsRefundDetails(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  orderReturnReview: financeProcedure
    .input(customerOrderReturnReviewSchema)
    .query(({ ctx, input }) =>
      getCustomerOrderReturnReview(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  returnOrderFunds: financeProcedure
    .input(customerOrderFundsReturnSchema)
    .mutation(({ ctx, input }) =>
      returnCustomerOrderFunds(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  receivables: financeProcedure
    .input(customerLedgerReceivablesSchema)
    .query(({ ctx, input }) =>
      listCustomerLedgerReceivables(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  allocationHistory: financeProcedure
    .input(customerLedgerAllocationHistorySchema)
    .query(({ ctx, input }) =>
      getCustomerLedgerAllocationHistory(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  ensureAccount: financeProcedure
    .input(customerLedgerEnsureAccountSchema)
    .mutation(({ ctx, input }) =>
      ensureCustomerLedgerAccount(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  recordOpening: financeProcedure
    .input(customerLedgerOpeningSchema)
    .mutation(({ ctx, input }) =>
      recordCustomerLedgerOpening(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  recordReceipt: financeProcedure
    .input(customerLedgerReceiptSchema)
    .mutation(({ ctx, input }) =>
      recordCustomerLedgerReceipt(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  /** Record a payment and use it on the oldest unpaid charges in one go. */
  recordReceiptAndApply: financeProcedure
    .input(customerLedgerReceiptSchema)
    .mutation(({ ctx, input }) =>
      recordCustomerLedgerReceiptAndApply(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  applyCredit: financeProcedure
    .input(customerLedgerApplyCreditSchema)
    .mutation(({ ctx, input }) =>
      applyCustomerLedgerCredit(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  releaseAllocation: financeProcedure
    .input(customerLedgerReleaseAllocationSchema)
    .mutation(({ ctx, input }) =>
      releaseCustomerLedgerAllocation(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  refundUnusedCredit: financeProcedure
    .input(customerLedgerRefundCreditSchema)
    .mutation(({ ctx, input }) =>
      refundCustomerLedgerCredit(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  reverseEntry: financeProcedure
    .input(customerLedgerReverseEntrySchema)
    .mutation(({ ctx, input }) =>
      reverseCustomerLedgerEntry(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  statement: financeProcedure
    .input(customerLedgerStatementSchema)
    .query(({ ctx, input }) =>
      getCustomerLedgerStatement(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  sources: financeProcedure
    .input(customerLedgerSourcesSchema)
    .query(({ ctx, input }) =>
      listCustomerLedgerSources(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  commandStatus: financeProcedure
    .input(customerLedgerCommandStatusSchema)
    .query(({ ctx, input }) =>
      getCustomerLedgerCommandStatus(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  accounts: financeProcedure
    .input(customerLedgerAccountsSchema)
    .query(({ ctx, input }) =>
      listCustomerLedgerAccounts(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  accountDetail: financeProcedure
    .input(customerLedgerAccountDetailSchema)
    .query(({ ctx, input }) =>
      getCustomerLedgerAccountDetail(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  entryDetail: financeProcedure
    .input(customerLedgerEntryDetailSchema)
    .query(({ ctx, input }) =>
      getCustomerLedgerEntryDetail(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
})
