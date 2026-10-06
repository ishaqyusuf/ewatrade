import {
  getFinanceBankStatement,
  importFinanceBankStatement,
  listFinanceBankMatchHistory,
  listFinanceBankStatements,
  matchFinanceBankStatement,
  resolveFinanceBankCorrectionSource,
  unmatchFinanceBankStatement,
} from "@ewatrade/db/queries"
import {
  financeBankCorrectionSourceSchema,
  financeBankMatchHistorySchema,
  financeBankMatchSchema,
  financeBankStatementImportSchema,
  financeBankStatementSchema,
  financeBankStatementsSchema,
  financeBankUnmatchSchema,
} from "../../schemas/finance-bank-statements"
import { financeProcedure } from "../finance-procedure"
import { createTRPCRouter } from "../init"

export const financeBankStatementsRouter = createTRPCRouter({
  resolveCorrectionSource: financeProcedure
    .input(financeBankCorrectionSourceSchema)
    .query(({ ctx, input }) =>
      resolveFinanceBankCorrectionSource(ctx.db, {
        ...input,
        ...ctx.financeActor,
      }),
    ),
  import: financeProcedure
    .input(financeBankStatementImportSchema)
    .mutation(({ ctx, input }) =>
      importFinanceBankStatement(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  list: financeProcedure
    .input(financeBankStatementsSchema)
    .query(({ ctx, input }) =>
      listFinanceBankStatements(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  get: financeProcedure
    .input(financeBankStatementSchema)
    .query(({ ctx, input }) =>
      getFinanceBankStatement(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  match: financeProcedure
    .input(financeBankMatchSchema)
    .mutation(({ ctx, input }) =>
      matchFinanceBankStatement(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  unmatch: financeProcedure
    .input(financeBankUnmatchSchema)
    .mutation(({ ctx, input }) =>
      unmatchFinanceBankStatement(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  history: financeProcedure
    .input(financeBankMatchHistorySchema)
    .query(({ ctx, input }) =>
      listFinanceBankMatchHistory(ctx.db, { ...input, ...ctx.financeActor }),
    ),
})
