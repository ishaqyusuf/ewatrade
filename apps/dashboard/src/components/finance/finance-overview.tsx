"use client"
import { Pill } from "@/components/orders/overview/order-overview-parts"
import { moneyAccountPurposeLabel } from "@/components/tables/finance-accounts/data-table"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import { Button, Skeleton } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { expensePill } from "./expense-status"
import { formatFinanceShortDate } from "./format-date"
import type { FinanceBook } from "./types"

const MONEY_PURPOSES = ["CASH", "BANK", "CLEARING"]

/** Finance pages workshop 01: what you have, who owes what, and recent spending. */
export function FinanceOverview({ book }: { book: FinanceBook }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewAccounts book={book} />
        <OverviewOwed book={book} />
      </div>
      <OverviewSpending book={book} />
    </div>
  )
}

function Panel({
  title,
  link,
  children,
}: {
  title: string
  link: { href: string; label: string }
  children: ReactNode
}) {
  return (
    <section className="min-w-0 border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="font-medium">{title}</h2>
        <Link
          href={link.href}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {link.label}
        </Link>
      </div>
      {children}
    </section>
  )
}

function PanelRow({
  title,
  subtitle,
  amount,
  aside,
  onOpen,
}: {
  title: ReactNode
  subtitle?: ReactNode
  amount: string
  aside?: ReactNode
  onOpen?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
      <div className="grid min-w-0 gap-0.5">
        {onOpen ? (
          <button
            type="button"
            className="truncate text-left font-medium underline-offset-4 hover:underline focus-visible:underline"
            onClick={onOpen}
          >
            {title}
          </button>
        ) : (
          <span className="truncate font-medium">{title}</span>
        )}
        {subtitle ? (
          <span className="truncate text-[13px] text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {aside}
        <span className="font-semibold tabular-nums">{amount}</span>
      </div>
    </div>
  )
}

function PanelState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-sm text-muted-foreground">{children}</p>
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
      <p className="text-sm">We couldn&apos;t load this. Try again.</p>
      <Button appearance="form" variant="outline" size="sm" onClick={retry}>
        Try again
      </Button>
    </div>
  )
}

function OverviewAccounts({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const router = useRouter()
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }),
  )
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
      title="Money accounts"
      link={{ href: "/finance/accounts", label: "See all" }}
    >
      {balances.isPending ? (
        <PanelSkeleton />
      ) : balances.isError ? (
        <PanelError retry={() => void balances.refetch()} />
      ) : !accounts.length ? (
        <PanelState>No money accounts yet.</PanelState>
      ) : (
        <>
          {accounts.map((account) => (
            <PanelRow
              key={account.id}
              title={account.name}
              subtitle={`${moneyAccountPurposeLabel(account.purpose)}${account.paymentsPausedAt ? " · Paused" : ""}`}
              amount={formatFinanceMoney(
                account.balanceMinor,
                book.currencyCode,
              )}
              onOpen={() =>
                router.push(`/finance/accounts?financeAccountId=${account.id}`)
              }
            />
          ))}
          <div className="flex justify-between border-t border-border px-4 py-3 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {formatFinanceMoney(total.toString(), book.currencyCode)}
            </span>
          </div>
        </>
      )}
    </Panel>
  )
}

function OverviewOwed({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const router = useRouter()
  const { setParams } = useFinanceParams()
  const owed = useQuery(
    trpc.finance.owedSummary.queryOptions({ bookId: book.id }),
  )
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`
  return (
    <Panel
      title="Who owes what"
      link={{ href: "/customer-ledger", label: "Customer balances" }}
    >
      {owed.isPending ? (
        <PanelSkeleton />
      ) : owed.isError ? (
        <PanelError retry={() => void owed.refetch()} />
      ) : (
        <>
          <PanelRow
            title="Customers owe you"
            subtitle={plural(owed.data.customers.count, "Customer")}
            amount={money(owed.data.customers.owedMinor)}
          />
          {owed.data.customers.top.map((customer) => (
            <PanelRow
              key={customer.id}
              title={<span className="font-normal">{customer.name}</span>}
              amount={money(customer.owedMinor)}
              onOpen={() =>
                router.push(
                  `/customers/${encodeURIComponent(customer.id)}/statement`,
                )
              }
            />
          ))}
          <PanelRow
            title="You owe Suppliers"
            subtitle={plural(owed.data.suppliers.count, "Supplier")}
            amount={money(owed.data.suppliers.owedMinor)}
          />
          {owed.data.suppliers.top.map((supplier) => (
            <PanelRow
              key={supplier.id}
              title={<span className="font-normal">{supplier.name}</span>}
              amount={money(supplier.owedMinor)}
              onOpen={() =>
                void setParams({
                  financeSheet: "supplier-statement",
                  supplierId: supplier.id,
                })
              }
            />
          ))}
        </>
      )}
    </Panel>
  )
}

function OverviewSpending({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const { setParams } = useFinanceParams()
  const bills = useQuery(
    trpc.finance.bills.queryOptions({ bookId: book.id, limit: 5 }),
  )
  return (
    <Panel
      title="Recent spending"
      link={{ href: "/finance/spending", label: "See all" }}
    >
      {bills.isPending ? (
        <PanelSkeleton />
      ) : bills.isError ? (
        <PanelError retry={() => void bills.refetch()} />
      ) : !bills.data.items.length ? (
        <PanelState>
          No expenses yet. Add what you spend as you pay it.
        </PanelState>
      ) : (
        bills.data.items.map((bill) => {
          const pill = expensePill(bill.status)
          return (
            <PanelRow
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
        })
      )}
    </Panel>
  )
}
