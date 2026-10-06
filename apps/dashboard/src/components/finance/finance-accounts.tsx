"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { MoneyAccountsDataTable } from "@/components/tables/finance-accounts/data-table"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useCallback } from "react"
import { FinanceAccountStatement } from "./account-statement"
import { OpenFinanceSheet } from "./open-finance-sheet"
import type { FinanceBook } from "./types"
export function FinanceAccounts({
  book,
  view,
  viewSwitcher,
}: {
  book: FinanceBook
  view: DirectoryView
  viewSwitcher: ReactNode
}) {
  const { financeAccountId, setParams } = useFinanceParams()
  const openStatement = useCallback(
    (accountId: string) => void setParams({ financeAccountId: accountId }),
    [setParams],
  )
  const trpc = useTRPC()
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }),
  )
  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Money accounts</h2>
        <div className="flex flex-wrap items-center gap-2">
          {viewSwitcher}
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
        <MoneyAccountsDataTable
          accounts={balances.data.accounts.filter((account) =>
            ["CASH", "BANK", "CLEARING"].includes(account.purpose),
          )}
          currencyCode={book.currencyCode}
          bookId={book.id}
          view={view}
          onOpenStatement={openStatement}
        />
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
