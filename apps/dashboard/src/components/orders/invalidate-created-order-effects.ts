import type { useTRPC } from "@/trpc/client"
import type { QueryClient } from "@tanstack/react-query"

/** A created Order can add a Customer, debt, collection and tracked Service work. */
export async function invalidateCreatedOrderEffects(
  client: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
) {
  await Promise.all([
    ...[
      trpc.finance.balances.pathKey(),
      trpc.finance.owedSummary.pathKey(),
      trpc.finance.customerBalances.pathKey(),
      trpc.finance.customerBalanceDirectory.pathKey(),
      trpc.finance.reports.pathKey(),
      trpc.finance.periodCloseChecklist.pathKey(),
      trpc.finance.inventoryReconciliation.pathKey(),
      trpc.customerLedger.accounts.pathKey(),
      trpc.customerLedger.accountDetail.pathKey(),
      trpc.customerLedger.receivables.pathKey(),
      trpc.customers.getById.pathKey(),
    ].map((queryKey) => client.invalidateQueries({ queryKey })),
    ...[
      trpc.customers.count.pathKey(),
      trpc.customers.listPage.pathKey(),
      trpc.orders.operationalSummary.pathKey(),
      trpc.orders.salesReport.pathKey(),
      trpc.serviceReporting.summary.pathKey(),
      trpc.serviceCommerce.report.pathKey(),
      trpc.serviceCommerce.reportDrilldown.pathKey(),
      trpc.search.global.pathKey(),
    ].map((queryKey) =>
      client.invalidateQueries({ queryKey, refetchType: "none" }),
    ),
  ])
}
