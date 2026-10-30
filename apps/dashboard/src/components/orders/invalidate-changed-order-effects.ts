import { invalidateServiceJobLists } from "@/components/service-work/invalidate-service-job-lists"
import type { useTRPC } from "@/trpc/client"
import {
  isLoadedCustomerLedgerStatement,
  isLoadedFinanceStatement,
} from "@/utils/finance-snapshot-query"
import {
  type QueryClient,
  type QueryKey,
  matchQuery,
} from "@tanstack/react-query"

export async function invalidateChangedOrderEffects(
  client: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
  refreshedOrderKeys: readonly QueryKey[],
) {
  // Keep deferred families stale without undoing the successful completion reads.
  await Promise.allSettled([
    client.invalidateQueries({
      ...trpc.orders.pathFilter({
        predicate: (query) =>
          query.state.status !== "success" ||
          !refreshedOrderKeys.some((queryKey) =>
            matchQuery({ queryKey }, query),
          ),
      }),
      refetchType: "none",
    }),
    ...[
      trpc.catalog.pathKey(),
      trpc.inventory.pathKey(),
      trpc.customers.pathKey(),
      trpc.search.pathKey(),
    ].map((queryKey) =>
      client.invalidateQueries({ queryKey, refetchType: "none" }),
    ),
  ])
  // Soft route refresh does not prefetch every mounted client projection.
  await Promise.allSettled([
    ...[
      trpc.orders.listPage.pathKey(),
      trpc.catalog.detail.pathKey(),
      trpc.customers.getById.pathKey(),
      trpc.services.getJob.pathKey(),
    ].map((queryKey) => client.invalidateQueries({ queryKey })),
    client.invalidateQueries(
      trpc.finance.pathFilter({
        predicate: (query) => !isLoadedFinanceStatement(query),
      }),
    ),
    client.invalidateQueries(
      trpc.customerLedger.pathFilter({
        predicate: (query) => !isLoadedCustomerLedgerStatement(query),
      }),
    ),
    invalidateServiceJobLists(client, trpc),
  ])
}
