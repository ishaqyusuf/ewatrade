"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { MoneyAccountsDataTable } from "@/components/tables/finance-accounts/data-table"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  type MoneyAccountPurpose,
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_METHOD_LABELS,
  moneyAccountPaymentMethods,
} from "@ewatrade/utils/finance-payment-methods"
import { useQuery } from "@tanstack/react-query"
import { useQueryState } from "nuqs"
import { useCallback } from "react"
import { FinanceAccountStatement } from "./account-statement"
import { formatFinanceDate } from "./format-date"
import {
  MoneyAccountSortMenu,
  accountSortParam,
  sortMoneyAccounts,
} from "./money-account-sort"
import type { FinanceBook } from "./types"
export function FinanceAccounts({
  book,
  view,
}: {
  book: FinanceBook
  view: DirectoryView
}) {
  const { financeAccountId, setParams } = useFinanceParams()
  const openStatement = useCallback(
    (accountId: string) => void setParams({ financeAccountId: accountId }),
    [setParams],
  )
  const openPaymentSettings = useCallback(
    (accountId: string) =>
      void setParams({
        financeSheet: "account-payments",
        paymentAccountId: accountId,
      }),
    [setParams],
  )
  const [accountSort] = useQueryState("accountSort", accountSortParam)
  const trpc = useTRPC()
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }),
  )
  return (
    <section className="grid gap-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Counts money recorded since{" "}
        {formatFinanceDate(book.startsAt, book.timezone)}, including order
        payments. Compare it with your cash and bank statements.
      </p>
      {balances.isPending ? (
        <output>Loading account balances…</output>
      ) : balances.isError ? (
        <FormFeedback appearance="dashboard">
          {balances.error.message}
        </FormFeedback>
      ) : (
        <>
          <PaymentMethodGaps accounts={balances.data.accounts} />
          <MoneyAccountSortMenu />
          <MoneyAccountsDataTable
            accounts={sortMoneyAccounts(
              balances.data.accounts.filter((account) =>
                ["CASH", "BANK", "CLEARING"].includes(account.purpose),
              ),
              accountSort,
            )}
            currencyCode={book.currencyCode}
            bookId={book.id}
            view={view}
            onOpenStatement={openStatement}
            onOpenPaymentSettings={openPaymentSettings}
          />
        </>
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

/** Payment methods staff can't record yet, because no available account takes them. */
export function PaymentMethodGaps({
  accounts,
  fix = "Open Payment settings on an account to fix this.",
}: {
  fix?: string
  accounts: Array<{
    purpose: string
    archivedAt: Date | string | null
    paymentMethods: string[]
    paymentsPausedAt: Date | string | null
  }>
}) {
  const open = accounts.filter(
    (account) =>
      !account.archivedAt &&
      !account.paymentsPausedAt &&
      ["CASH", "BANK", "CLEARING"].includes(account.purpose),
  )
  const missing = ORDER_PAYMENT_METHODS.filter(
    (method) =>
      !open.some((account) =>
        moneyAccountPaymentMethods({
          purpose: account.purpose as MoneyAccountPurpose,
          paymentMethods: account.paymentMethods,
        }).includes(method),
      ),
  )
  if (!missing.length) return null
  return (
    <FormFeedback appearance="dashboard">
      No account takes{" "}
      {missing.map((method) => ORDER_PAYMENT_METHOD_LABELS[method]).join(", ")}{" "}
      payments, so staff can't record them yet. {fix}
    </FormFeedback>
  )
}
