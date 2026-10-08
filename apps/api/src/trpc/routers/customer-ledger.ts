import {
  applyCustomerLedgerCredit,
  ensureCustomerLedgerAccount,
  getCustomerLedgerAccountDetail,
  getCustomerLedgerAllocationHistory,
  getCustomerLedgerCommandStatus,
  getCustomerLedgerEntryDetail,
  getCustomerLedgerStatement,
  listCustomerLedgerAccounts,
  listCustomerLedgerReceivables,
  listCustomerLedgerSources,
  recordCustomerLedgerOpening,
  recordCustomerLedgerReceipt,
  refundCustomerLedgerCredit,
  releaseCustomerLedgerAllocation,
  reverseCustomerLedgerEntry,
} from "@ewatrade/db/queries"
import {
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
} from "../../schemas/customer-ledger"
import { financeProcedure } from "../finance-procedure"
import { createTRPCRouter } from "../init"

export const customerLedgerRouter = createTRPCRouter({
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
