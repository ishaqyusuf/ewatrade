import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
export type FinanceBook = NonNullable<RouterOutputs["finance"]["book"]>
export type FinanceBillRow = RouterOutputs["finance"]["bills"]["items"][number]
export type FinanceSupplierRow =
  RouterOutputs["finance"]["suppliers"]["data"][number]
