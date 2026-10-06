import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
export type FinanceBook = NonNullable<RouterOutputs["finance"]["book"]>
export type FinanceBillRow = RouterOutputs["finance"]["bills"]["items"][number]
export type FinanceSupplierRow =
  RouterOutputs["finance"]["suppliers"]["data"][number]

export type FinanceBankStatementRow =
  RouterOutputs["finance"]["bankStatements"]["list"]["items"][number]
export type FinanceBankStatementDetailData =
  RouterOutputs["finance"]["bankStatements"]["get"]
