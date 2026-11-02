"use client"
import { useTRPC } from "@/trpc/client"
import {
  isLoadedFinanceRecord,
  isLoadedFinanceStatement,
} from "@/utils/finance-snapshot-query"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

export type FinanceRefreshEffect =
  | "finance"
  | "expense-categories"
  | "money-accounts"
  | "payment-settings"
  | "book-setup"

export function useFinanceInvalidation(
  effect: FinanceRefreshEffect = "finance",
) {
  const trpc = useTRPC()
  const client = useQueryClient()
  return useCallback(async () => {
    // Account/category creation adds setup only; existing loaded records stay.
    const keepsRecords =
      effect === "expense-categories" || effect === "money-accounts"
    await Promise.all([
      client.invalidateQueries(
        trpc.finance.pathFilter({
          predicate: (query) =>
            !isLoadedFinanceStatement(query) &&
            !(keepsRecords && isLoadedFinanceRecord(query)),
        }),
      ),
      ...(effect !== "finance" && effect !== "expense-categories"
        ? [
            client.invalidateQueries({
              queryKey: trpc.orders.paymentAccounts.pathKey(),
            }),
          ]
        : []),
      ...(effect === "money-accounts" || effect === "payment-settings"
        ? [
            client.invalidateQueries({
              queryKey: trpc.businessBanking.accounts.pathKey(),
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
