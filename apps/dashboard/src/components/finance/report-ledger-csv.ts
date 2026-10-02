import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
export type FinanceLedger = RouterOutputs["finance"]["accountLedger"]
export {
  buildFinanceLedgerCsv,
  collectFinanceLedgerPages,
} from "@ewatrade/utils/finance-report-output"
