"use client"
import { Pill } from "@/components/orders/overview/order-overview-parts"
import { moneyAccountPurposeLabel } from "@/components/tables/finance-accounts/purpose-label"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button, Skeleton } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { expensePill } from "./expense-status"
import { FinanceRow } from "./finance-rows"
import { formatFinanceShortDate } from "./format-date"
import type { FinanceBookStatus } from "./types"

const MONEY_PURPOSES = ["CASH", "BANK", "CLEARING"]

/**
 * Money first: the total you have and where it is, then who owes what, then
 * recent spending. Every row opens its record.
 */
export function FinanceOverview({ book }: { book: FinanceBookStatus }) {
  const trpc = useTRPC()
  // One read, one snapshot: balances, who owes what and the latest expenses.
  const overview = useQuery(
    trpc.finance.overview.queryOptions({ bookId: book.id }),
  )
  const read = <T,>(pick: (data: OverviewData) => T): PanelRead<T> => ({
    isPending: overview.isPending,
    isError: overview.isError,
    data: overview.data ? pick(overview.data) : undefined,
    refetch: () => void overview.refetch(),
  })
  return (
    <div className="grid gap-4 pb-8">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <OverviewAccounts
          book={book}
          balances={read((data) => data.balances)}
        />
        <OverviewOwed book={book} owed={read((data) => data.owed)} />
      </div>
      <OverviewSpending book={book} bills={read((data) => data.bills)} />
    </div>
  )
}

type OverviewData = RouterOutputs["finance"]["overview"]
type PanelRead<T> = {
  isPending: boolean
  isError: boolean
  data: T | undefined
  refetch: () => void
}

function Panel({
  title,
  link,
  lead,
  children,
}: {
  title: string
  link: { href: string; label: string }
  /** A headline amount under the title. */
  lead?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {lead}
        </div>
        <Link
          href={link.href}
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-[color:var(--link)] underline-offset-4 hover:underline -my-2"
        >
          {link.label}
        </Link>
      </div>
      <div className="border-t border-border">{children}</div>
    </section>
  )
}

/** Rows inside a panel: a list when there are records, else the state. */
function PanelRows({
  label,
  children,
}: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {children}
    </ul>
  )
}

function PanelState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-muted-foreground">{children}</p>
}

function PanelSkeleton() {
  return (
    <div className="grid gap-3 p-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-3/5" />
    </div>
  )
}

function PanelError({ retry }: { retry: () => void }) {
  return (
    <div className="grid justify-items-start gap-2 px-4 py-4" role="alert">
      <p>We couldn&apos;t load this.</p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  )
}

function OverviewAccounts({
  book,
  balances,
}: {
  book: FinanceBookStatus
  balances: PanelRead<OverviewData["balances"]>
}) {
  const router = useRouter()
  const accounts =
    balances.data?.accounts.filter(
      (account) =>
        MONEY_PURPOSES.includes(account.purpose) && !account.archivedAt,
    ) ?? []
  const total = accounts.reduce(
    (sum, account) => sum + BigInt(account.balanceMinor),
    0n,
  )
  return (
    <Panel
      title="Money you have"
      link={{ href: "/finance/accounts", label: "Accounts" }}
      lead={
        balances.data && accounts.length ? (
          <p className="text-3xl font-semibold tabular-nums">
            {formatFinanceMoney(total.toString(), book.currencyCode)}
          </p>
        ) : null
      }
    >
      {balances.isPending ? (
        <PanelSkeleton />
      ) : balances.isError ? (
        <PanelError retry={balances.refetch} />
      ) : !accounts.length ? (
        <PanelState>No money accounts yet.</PanelState>
      ) : (
        <PanelRows label="Money accounts">
          {accounts.map((account) => (
            <FinanceRow
              key={account.id}
              title={account.name}
              subtitle={`${moneyAccountPurposeLabel(account.purpose, account.mobileMoney)}${account.paymentsPausedAt ? " · Paused" : ""}`}
              amount={formatFinanceMoney(
                account.balanceMinor,
                book.currencyCode,
              )}
              onOpen={() =>
                router.push(`/finance/accounts?financeAccountId=${account.id}`)
              }
            />
          ))}
        </PanelRows>
      )}
    </Panel>
  )
}

function OverviewOwed({
  book,
  owed,
}: {
  book: FinanceBookStatus
  owed: PanelRead<OverviewData["owed"]>
}) {
  const router = useRouter()
  const { setParams } = useFinanceParams()
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`
  return (
    <Panel
      title="Who owes what"
      link={{ href: "/customer-ledger", label: "Customers" }}
    >
      {owed.isPending ? (
        <PanelSkeleton />
      ) : owed.isError || !owed.data ? (
        <PanelError retry={owed.refetch} />
      ) : (
        <PanelRows label="Who owes what">
          <FinanceRow
            title="Customers owe you"
            subtitle={plural(owed.data.customers.count, "customer")}
            amount={money(owed.data.customers.owedMinor)}
          />
          {owed.data.customers.top.map((customer) => (
            <FinanceRow
              key={customer.id}
              inset
              title={customer.name}
              amount={money(customer.owedMinor)}
              onOpen={() =>
                router.push(
                  `/customers/${encodeURIComponent(customer.id)}/statement`,
                )
              }
            />
          ))}
          <FinanceRow
            title="You owe suppliers"
            subtitle={plural(owed.data.suppliers.count, "supplier")}
            amount={money(owed.data.suppliers.owedMinor)}
          />
          {owed.data.suppliers.top.map((supplier) => (
            <FinanceRow
              key={supplier.id}
              inset
              title={supplier.name}
              amount={money(supplier.owedMinor)}
              onOpen={() =>
                void setParams({
                  financeSheet: "supplier-statement",
                  supplierId: supplier.id,
                })
              }
            />
          ))}
        </PanelRows>
      )}
    </Panel>
  )
}

function OverviewSpending({
  book,
  bills,
}: {
  book: FinanceBookStatus
  bills: PanelRead<OverviewData["bills"]>
}) {
  const { setParams } = useFinanceParams()
  return (
    <Panel
      title="Recent spending"
      link={{ href: "/finance/spending", label: "All spending" }}
    >
      {bills.isPending ? (
        <PanelSkeleton />
      ) : bills.isError || !bills.data ? (
        <PanelError retry={bills.refetch} />
      ) : !bills.data.items.length ? (
        <PanelState>No spending yet.</PanelState>
      ) : (
        <PanelRows label="Recent spending">
          {bills.data.items.map((bill) => {
            const pill = expensePill(bill.status)
            return (
              <FinanceRow
                key={bill.id}
                title={bill.description}
                subtitle={`${bill.payeeName} · ${formatFinanceShortDate(bill.incurredAt, book.timezone)}`}
                amount={formatFinanceMoney(bill.totalMinor, book.currencyCode)}
                aside={<Pill tone={pill.tone}>{pill.label}</Pill>}
                onOpen={() =>
                  void setParams({ financeSheet: "bill", billId: bill.id })
                }
              />
            )
          })}
        </PanelRows>
      )}
    </Panel>
  )
}
