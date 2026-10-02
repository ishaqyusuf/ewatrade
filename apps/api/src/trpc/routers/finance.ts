import {
  adjustFinanceCashCount,
  allocateFinanceSupplierAdvance,
  changeFinancePeriod,
  configureFinanceFiscalCalendar,
  createFinanceBook,
  createFinanceExpenseCategory,
  createFinanceMoneyAccount,
  createFinanceSupplier,
  getFinanceAccountBalances,
  getFinanceBill,
  getFinanceBook,
  getFinanceCashCount,
  getFinanceCommandStatus,
  getFinanceFiscalCalendar,
  getFinanceMoneyMovement,
  getFinancePeriodCloseChecklist,
  getFinancePeriods,
  getFinancePurchaseBill,
  getFinancePurchaseRecognition,
  getFinanceReports,
  getFinanceSupplierPayableAging,
  getFinanceSupplierStatement,
  getFinanceYearEndPreview,
  listFinanceAccountActivity,
  listFinanceAccountLedger,
  listFinanceBills,
  listFinanceCashCounts,
  listFinanceJournal,
  listFinancePeriodAudit,
  listFinancePurchaseBills,
  listFinancePurchaseRecognitions,
  listFinanceSuppliers,
  payFinanceBill,
  payFinancePurchaseBill,
  recognizeFinancePurchase,
  recordFinanceCashCount,
  recordFinanceExpense,
  recordFinanceMoneyMovement,
  recordFinancePurchase,
  recordFinanceSupplierAdvance,
  recordFinanceSupplierOpening,
  registerFinancePurchase,
  releaseFinanceSupplierAllocation,
  reverseFinanceBillPayment,
  reverseFinanceCashAdjustment,
  reverseFinanceMoney,
  reverseFinancePurchasePayment,
  reverseFinancePurchaseRecognition,
  reverseFinanceSupplierEntry,
  voidFinanceExpense,
} from "@ewatrade/db/queries"
import {
  financeAccountActivitySchema,
  financeAccountSchema,
  financeBillPaymentSchema,
  financeBillSchema,
  financeBillsSchema,
  financeBookSchema,
  financeCashAdjustmentReversalSchema,
  financeCashAdjustmentSchema,
  financeCashCountDetailSchema,
  financeCashCountSchema,
  financeCashCountsSchema,
  financeCategorySchema,
  financeCommandSchema,
  financeExpenseSchema,
  financeFiscalCalendarSchema,
  financeJournalPageSchema,
  financeMoneyMovementSchema,
  financeMoneyReversalSchema,
  financeMoneySchema,
  financePeriodCloseChecklistSchema,
  financePeriodSchema,
  financeReportsSchema,
  financeReverseBillPaymentSchema,
  financeSetupSchema,
  financeVoidExpenseSchema,
} from "../../schemas/finance"
import { financePeriodAuditSchema } from "../../schemas/finance-period-audit"
import {
  financePurchaseDetailSchema,
  financePurchasePaymentReversalSchema,
  financePurchasePaymentSchema,
  financePurchaseRecognitionDetailSchema,
  financePurchaseRecognitionReversalSchema,
  financePurchaseRecognitionSchema,
  financePurchaseRecognitionsSchema,
  financePurchaseRegistrationSchema,
  financePurchaseSchema,
  financePurchasesSchema,
  financeSupplierAllocationReleaseSchema,
  financeSupplierAllocationSchema,
} from "../../schemas/finance-purchases"
import { financeSupplierPayableAgingSchema } from "../../schemas/finance-supplier-aging"
import {
  financeSupplierAdvanceSchema,
  financeSupplierCreateSchema,
  financeSupplierOpeningSchema,
  financeSupplierReversalSchema,
  financeSupplierStatementSchema,
  financeSuppliersSchema,
} from "../../schemas/finance-suppliers"
import { financeProcedure } from "../finance-procedure"
import { createTRPCRouter } from "../init"
import { financeExpenseReceiptsRouter } from "./finance-expense-receipts"

export const financeRouter = createTRPCRouter({
  yearEndPreview: financeProcedure
    .input(financeBookSchema)
    .query(({ ctx, input }) =>
      getFinanceYearEndPreview(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  fiscalCalendar: financeProcedure
    .input(financeBookSchema)
    .query(({ ctx, input }) =>
      getFinanceFiscalCalendar(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  configureFiscalCalendar: financeProcedure
    .input(financeFiscalCalendarSchema)
    .mutation(({ ctx, input }) =>
      configureFinanceFiscalCalendar(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  expenseReceipts: financeExpenseReceiptsRouter,
  registerPurchase: financeProcedure
    .input(financePurchaseRegistrationSchema)
    .mutation(({ ctx, input }) =>
      registerFinancePurchase(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  recognizePurchase: financeProcedure
    .input(financePurchaseRecognitionSchema)
    .mutation(({ ctx, input }) =>
      recognizeFinancePurchase(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  reversePurchaseRecognition: financeProcedure
    .input(financePurchaseRecognitionReversalSchema)
    .mutation(({ ctx, input }) =>
      reverseFinancePurchaseRecognition(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  purchaseRecognition: financeProcedure
    .input(financePurchaseRecognitionDetailSchema)
    .query(({ ctx, input }) =>
      getFinancePurchaseRecognition(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  purchaseRecognitions: financeProcedure
    .input(financePurchaseRecognitionsSchema)
    .query(({ ctx, input }) =>
      listFinancePurchaseRecognitions(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  recordPurchase: financeProcedure
    .input(financePurchaseSchema)
    .mutation(({ ctx, input }) =>
      recordFinancePurchase(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  payPurchase: financeProcedure
    .input(financePurchasePaymentSchema)
    .mutation(({ ctx, input }) =>
      payFinancePurchaseBill(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  reversePurchasePayment: financeProcedure
    .input(financePurchasePaymentReversalSchema)
    .mutation(({ ctx, input }) =>
      reverseFinancePurchasePayment(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  allocateSupplierAdvance: financeProcedure
    .input(financeSupplierAllocationSchema)
    .mutation(({ ctx, input }) =>
      allocateFinanceSupplierAdvance(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  releaseSupplierAllocation: financeProcedure
    .input(financeSupplierAllocationReleaseSchema)
    .mutation(({ ctx, input }) =>
      releaseFinanceSupplierAllocation(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  purchase: financeProcedure
    .input(financePurchaseDetailSchema)
    .query(({ ctx, input }) =>
      getFinancePurchaseBill(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  purchases: financeProcedure
    .input(financePurchasesSchema)
    .query(({ ctx, input }) =>
      listFinancePurchaseBills(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  createSupplier: financeProcedure
    .input(financeSupplierCreateSchema)
    .mutation(({ ctx, input }) =>
      createFinanceSupplier(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  recordSupplierOpening: financeProcedure
    .input(financeSupplierOpeningSchema)
    .mutation(({ ctx, input }) =>
      recordFinanceSupplierOpening(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  recordSupplierAdvance: financeProcedure
    .input(financeSupplierAdvanceSchema)
    .mutation(({ ctx, input }) =>
      recordFinanceSupplierAdvance(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  reverseSupplierEntry: financeProcedure
    .input(financeSupplierReversalSchema)
    .mutation(({ ctx, input }) =>
      reverseFinanceSupplierEntry(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  suppliers: financeProcedure
    .input(financeSuppliersSchema)
    .query(({ ctx, input }) =>
      listFinanceSuppliers(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  supplierStatement: financeProcedure
    .input(financeSupplierStatementSchema)
    .query(({ ctx, input }) =>
      getFinanceSupplierStatement(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  supplierPayableAging: financeProcedure
    .input(financeSupplierPayableAgingSchema)
    .query(({ ctx, input }) =>
      getFinanceSupplierPayableAging(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  reverseCashAdjustment: financeProcedure
    .input(financeCashAdjustmentReversalSchema)
    .mutation(({ ctx, input }) =>
      reverseFinanceCashAdjustment(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  adjustCashCount: financeProcedure
    .input(financeCashAdjustmentSchema)
    .mutation(({ ctx, input }) =>
      adjustFinanceCashCount(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  periods: financeProcedure
    .input(financeBookSchema)
    .query(({ ctx, input }) =>
      getFinancePeriods(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  periodCloseChecklist: financeProcedure
    .input(financePeriodCloseChecklistSchema)
    .query(({ ctx, input }) =>
      getFinancePeriodCloseChecklist(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  changePeriod: financeProcedure
    .input(financePeriodSchema)
    .mutation(({ ctx, input }) =>
      changeFinancePeriod(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  periodAudit: financeProcedure
    .input(financePeriodAuditSchema)
    .query(({ ctx, input }) =>
      listFinancePeriodAudit(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  reports: financeProcedure
    .input(financeReportsSchema)
    .query(({ ctx, input }) =>
      getFinanceReports(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  voidExpense: financeProcedure
    .input(financeVoidExpenseSchema)
    .mutation(({ ctx, input }) =>
      voidFinanceExpense(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  reverseBillPayment: financeProcedure
    .input(financeReverseBillPaymentSchema)
    .mutation(({ ctx, input }) =>
      reverseFinanceBillPayment(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  accountLedger: financeProcedure
    .input(financeAccountActivitySchema)
    .query(({ ctx, input }) =>
      listFinanceAccountLedger(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  accountActivity: financeProcedure
    .input(financeAccountActivitySchema)
    .query(({ ctx, input }) =>
      listFinanceAccountActivity(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  cashCounts: financeProcedure
    .input(financeCashCountsSchema)
    .query(({ ctx, input }) =>
      listFinanceCashCounts(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  recordCashCount: financeProcedure
    .input(financeCashCountSchema)
    .mutation(({ ctx, input }) =>
      recordFinanceCashCount(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  cashCount: financeProcedure
    .input(financeCashCountDetailSchema)
    .query(({ ctx, input }) =>
      getFinanceCashCount(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  reverseMoney: financeProcedure
    .input(financeMoneyReversalSchema)
    .mutation(({ ctx, input }) =>
      reverseFinanceMoney(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  moneyMovement: financeProcedure
    .input(financeMoneyMovementSchema)
    .query(({ ctx, input }) =>
      getFinanceMoneyMovement(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  createExpenseCategory: financeProcedure
    .input(financeCategorySchema)
    .mutation(({ ctx, input }) =>
      createFinanceExpenseCategory(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  recordExpense: financeProcedure
    .input(financeExpenseSchema)
    .mutation(({ ctx, input }) =>
      recordFinanceExpense(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  payBill: financeProcedure
    .input(financeBillPaymentSchema)
    .mutation(({ ctx, input }) =>
      payFinanceBill(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  bill: financeProcedure
    .input(financeBillSchema)
    .query(({ ctx, input }) =>
      getFinanceBill(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  bills: financeProcedure
    .input(financeBillsSchema)
    .query(({ ctx, input }) =>
      listFinanceBills(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  book: financeProcedure.query(({ ctx }) =>
    getFinanceBook(ctx.db, ctx.financeActor),
  ),
  setup: financeProcedure
    .input(financeSetupSchema)
    .mutation(({ ctx, input }) =>
      createFinanceBook(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  createMoneyAccount: financeProcedure
    .input(financeAccountSchema)
    .mutation(({ ctx, input }) =>
      createFinanceMoneyAccount(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  balances: financeProcedure
    .input(financeBookSchema)
    .query(({ ctx, input }) =>
      getFinanceAccountBalances(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  journal: financeProcedure
    .input(financeJournalPageSchema)
    .query(({ ctx, input }) =>
      listFinanceJournal(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  recordMoney: financeProcedure
    .input(financeMoneySchema)
    .mutation(({ ctx, input }) =>
      recordFinanceMoneyMovement(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  commandStatus: financeProcedure
    .input(financeCommandSchema)
    .query(({ ctx, input }) =>
      getFinanceCommandStatus(ctx.db, { ...input, ...ctx.financeActor }),
    ),
})
