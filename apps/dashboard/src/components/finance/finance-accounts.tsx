"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { PaymentPlanNotices } from "@/components/notification-center/payment-plan-notices"
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
import { BankDetailsCards } from "./bank-details-cards"
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
  const openBankDetails = useCallback(
    (accountId: string | null) =>
      void setParams({
        financeSheet: "bank-details",
        paymentAccountId: accountId,
      }),
    [setParams],
  )
  const [accountSort] = useQueryState("accountSort", accountSortParam)
  const trpc = useTRPC()
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }),
  )
  const bankAccounts = useQuery(
    trpc.businessBanking.accounts.queryOptions(
      { bookId: book.id },
      { retry: false },
    ),
  )
  const bankDetails = new Map(
    (bankAccounts.data ?? []).map((account) => [account.id, account]),
  )
  return (
    <section className="grid gap-5">
      <PaymentPlanNotices
        appearance="page"
        timeZone={book.timezone}
        bookId={book.id}
      />
      <BankDetailsCards
        accounts={bankAccounts.data ?? []}
        isPending={bankAccounts.isPending}
        error={bankAccounts.isError ? bankAccounts.error.message : null}
        onEdit={openBankDetails}
        onAdd={() => openBankDetails(null)}
      />
      <p className="max-w-2xl text-sm text-muted-foreground">
        Counts money recorded since{" "}
        {formatFinanceDate(book.startsAt, book.timezone)}, including order
        payments. Balances are what you recorded in EwaTrade, not a live balance
        from your bank. Compare them with your cash and bank statements.
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
            ).map((account) => {
              const bank = bankDetails.get(account.id)
              return bank
                ? {
                    ...account,
                    bankDetails: {
                      bankName: bank.bankName,
                      accountNumber: bank.bankAccountNumber,
                      accountHolder: bank.bankAccountHolder,
                    },
                  }
                : account
            })}
            currencyCode={book.currencyCode}
            bookId={book.id}
            view={view}
            onOpenStatement={openStatement}
            onOpenPaymentSettings={openPaymentSettings}
            onOpenBankDetails={
              bankAccounts.isSuccess ? openBankDetails : undefined
            }
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
