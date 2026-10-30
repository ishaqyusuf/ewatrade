import { invalidateServiceJobLists } from "@/components/service-work/invalidate-service-job-lists"
import type { useTRPC } from "@/trpc/client"
import {
  isLoadedCustomerLedgerStatement,
  isLoadedFinanceStatement,
} from "@/utils/finance-snapshot-query"
import type { QueryClient } from "@tanstack/react-query"

export async function invalidateCustomerLedgerEffects(
  client: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
) {
  await Promise.all([
    client.invalidateQueries(
      trpc.customerLedger.pathFilter({
        predicate: (query) => !isLoadedCustomerLedgerStatement(query),
      }),
    ),
    client.invalidateQueries(
      trpc.finance.pathFilter({
        predicate: (query) => !isLoadedFinanceStatement(query),
      }),
    ),
    client.invalidateQueries({ queryKey: trpc.orders.pathKey() }),
    client.invalidateQueries({ queryKey: trpc.customers.getById.pathKey() }),
    invalidateServiceJobLists(client, trpc),
    client.invalidateQueries({ queryKey: trpc.services.getJob.pathKey() }),
  ])
}
