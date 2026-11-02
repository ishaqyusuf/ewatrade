import {
  CustomerMessageError,
  prepareCustomerAccountMessageOpen,
  previewCustomerAccountMessage,
} from "@ewatrade/db/customer-messages"
import {
  CustomerDirectoryError,
  applyCustomerLedgerCredit,
  cancelCustomerFundsRefund,
  completeCustomerFundsRefund,
  createCustomerWithOpening,
  encryptCustomerRefundDestination,
  ensureCustomerLedgerAccount,
  getCustomerFundsRefundDetail,
  getCustomerLedgerAccountDetail,
  getCustomerLedgerAging,
  getCustomerLedgerAllocationHistory,
  getCustomerLedgerCommandStatus,
  getCustomerLedgerEntryDetail,
  getCustomerLedgerStatement,
  getCustomerOrderReturnReview,
  linkCustomerHistoricalOrders,
  listCustomerFundsRefunds,
  listCustomerLedgerAccounts,
  listCustomerLedgerReceivables,
  listCustomerLedgerSources,
  listCustomerOrderLinkSuggestions,
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
import { TRPCError } from "@trpc/server"
import {
  customerAccountMessageOpenSchema,
  customerAccountMessagePreviewSchema,
  customerFundsRefundChangeSchema,
  customerFundsRefundCompleteSchema,
  customerFundsRefundDetailSchema,
  customerFundsRefundListSchema,
  customerFundsRefundNeedDetailsSchema,
  customerFundsRefundRequestSchema,
  customerFundsRefundReserveSchema,
  customerLedgerAccountDetailSchema,
  customerLedgerAccountsSchema,
  customerLedgerAgingSchema,
  customerLedgerAllocationHistorySchema,
  customerLedgerApplyCreditSchema,
  customerLedgerCommandStatusSchema,
  customerLedgerCreateCustomerWithOpeningSchema,
  customerLedgerEnsureAccountSchema,
  customerLedgerEntryDetailSchema,
  customerLedgerLinkOrdersSchema,
  customerLedgerOpeningSchema,
  customerLedgerOrderLinkSuggestionsSchema,
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

/** Customer-account messages use the active Store's wording and name. */
function activeStoreId(ctx: {
  tenantContext: { activeStore?: { id: string } | null }
}) {
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId)
    throw new TRPCError({ code: "NOT_FOUND", message: "Choose a Store first." })
  return storeId
}

async function accountMessage<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof CustomerMessageError)
      throw new TRPCError({
        code: error.code,
        message: error.message,
        cause: error,
      })
    throw error
  }
}

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
  aging: financeProcedure
    .input(customerLedgerAgingSchema)
    .query(({ ctx, input }) =>
      getCustomerLedgerAging(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  createCustomerWithOpening: financeProcedure
    .input(customerLedgerCreateCustomerWithOpeningSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createCustomerWithOpening(ctx.db, {
          ...input,
          ...ctx.financeActor,
        })
      } catch (error) {
        if (error instanceof CustomerDirectoryError)
          throw new TRPCError({ code: "CONFLICT", message: error.message })
        throw error
      }
    }),
  orderLinkSuggestions: financeProcedure
    .input(customerLedgerOrderLinkSuggestionsSchema)
    .query(({ ctx, input }) =>
      listCustomerOrderLinkSuggestions(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  linkOrders: financeProcedure
    .input(customerLedgerLinkOrdersSchema)
    .mutation(({ ctx, input }) =>
      linkCustomerHistoricalOrders(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  accountMessagePreview: financeProcedure
    .input(customerAccountMessagePreviewSchema)
    .query(({ ctx, input }) =>
      accountMessage(() =>
        previewCustomerAccountMessage(ctx.db, {
          ...input,
          ...ctx.financeActor,
          storeId: activeStoreId(ctx),
        }),
      ),
    ),
  accountMessageOpen: financeProcedure
    .input(customerAccountMessageOpenSchema)
    .mutation(({ ctx, input }) =>
      accountMessage(() =>
        prepareCustomerAccountMessageOpen(ctx.db, {
          ...input,
          ...ctx.financeActor,
          storeId: activeStoreId(ctx),
        }),
      ),
    ),
})
