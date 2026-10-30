"use client"
import { useTRPC } from "@/trpc/client"
import { isLoadedFinanceStatement } from "@/utils/finance-snapshot-query"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

export type FinanceRefreshEffect = "finance" | "money-accounts" | "book-setup"

export function useFinanceInvalidation(
  effect: FinanceRefreshEffect = "finance",
) {
  const trpc = useTRPC()
  const client = useQueryClient()
  return useCallback(async () => {
    await Promise.all([
      client.invalidateQueries(
        trpc.finance.pathFilter({
          predicate: (query) => !isLoadedFinanceStatement(query),
        }),
      ),
      ...(effect !== "finance"
        ? [
            client.invalidateQueries({
              queryKey: trpc.orders.paymentAccounts.pathKey(),
            }),
          ]
        : []),
      ...(effect === "book-setup"
        ? [
            client.invalidateQueries({
              queryKey: trpc.customerLedger.accountDetail.pathKey(),
            }),
          ]
        : []),
    ])
  }, [client, effect, trpc])
}
