"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { FinanceAccountStatement } from "./account-statement"
import { OpenFinanceSheet } from "./open-finance-sheet"
import type { FinanceBook } from "./types"
export function FinanceAccounts({ book }: { book: FinanceBook }) {
  const { financeAccountId, setParams } = useFinanceParams()
  const trpc = useTRPC()
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }),
  )
  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Money accounts</h2>
        <div className="flex flex-wrap gap-2">
          <OpenFinanceSheet mode="account" secondary>
            Add account
          </OpenFinanceSheet>
          <OpenFinanceSheet mode="money" secondary>
            Record movement
          </OpenFinanceSheet>
        </div>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Balances reflect finance entries recorded since{" "}
        {new Date(book.startsAt).toISOString().slice(0, 10)}. Existing sales and
        customer payments have not been imported. Check these recorded amounts
        against your cash and bank statements.
      </p>
      {balances.isPending ? (
        <output>Loading account balances…</output>
      ) : balances.isError ? (
        <FormFeedback appearance="dashboard">
          {balances.error.message}
        </FormFeedback>
      ) : (
        <div>
          {balances.data.accounts
            .filter((account) =>
              ["CASH", "BANK", "CLEARING"].includes(account.purpose),
            )
            .map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-4"
              >
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {account.purpose === "CLEARING"
                      ? "Awaiting settlement"
                      : account.purpose === "CASH"
                        ? "Cash"
                        : "Bank"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-lg font-medium tabular-nums">
                    {formatFinanceMoney(
                      account.balanceMinor,
                      book.currencyCode,
                    )}
                  </p>
                  <Button
                    appearance="form"
                    variant="outline"
                    aria-label={`View ${account.name} statement`}
                    onClick={() =>
                      void setParams({ financeAccountId: account.id })
                    }
                  >
                    View statement
                  </Button>
                </div>
              </div>
            ))}
        </div>
      )}
      {financeAccountId ? (
        <FinanceAccountStatement
          key={`${book.id}:${financeAccountId}`}
          book={book}
          accountId={financeAccountId}
        />
      ) : null}
    </section>
  )
}
