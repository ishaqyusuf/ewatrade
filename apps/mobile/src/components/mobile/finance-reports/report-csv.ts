import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
export type FinanceReport = RouterOutputs["finance"]["reports"]
export { buildFinanceReportCsv } from "@ewatrade/utils/finance-report-output"
