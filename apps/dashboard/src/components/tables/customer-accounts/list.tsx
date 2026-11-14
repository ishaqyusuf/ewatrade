"use client"

import { formatFinanceShortDate } from "@/components/finance/format-date"
import { Pill } from "@/components/orders/overview/order-overview-parts"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"

export type CustomerAccount =
  RouterOutputs["finance"]["customerBalanceDirectory"]["items"][number]

const contact = (customer: CustomerAccount) =>
  customer.phone ?? customer.email ?? "No phone"
/** How long the oldest unpaid charge has waited: amber, red after 30 days. */
function OwingSince({ customer }: { customer: CustomerAccount }) {
  if (!customer.owingSince) {
    if (customer.paidAheadMinor !== "0")
      return <Pill tone="green">Paid ahead</Pill>
    return customer.owedMinor === "0" ? <Pill tone="muted">Paid up</Pill> : null
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(customer.owingSince).getTime()) / 864e5),
  )
  return (
    <Pill tone={days > 30 ? "red" : "amber"}>
      {days === 0
        ? "Owing since today"
        : `Owing ${days} day${days === 1 ? "" : "s"}`}
    </Pill>
  )
}

function LastPayment({
  customer,
  currency,
}: {
  customer: CustomerAccount
  currency: string
}) {
  if (!customer.lastPaymentAt || !customer.lastPaymentMinor)
    return <span className="text-muted-foreground">—</span>
  return (
    <span className="tabular-nums">
      {formatFinanceMoney(customer.lastPaymentMinor, currency)}{" "}
      <span className="text-muted-foreground">
        · {formatFinanceShortDate(customer.lastPaymentAt)}
      </span>
    </span>
  )
}

/**
 * What each saved customer owes, one row each; a row opens the customer's
 * details sheet (Record payment, Send reminder, Statement).
 */
export function CustomerAccountsList({
  rows,
  currencyCode,
  count,
  owedMinor,
  onOpen,
}: {
  rows: CustomerAccount[]
  currencyCode: string
  count: number
  owedMinor: string
  onOpen: (customerId: string) => void
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {`${count} ${count === 1 ? "customer" : "customers"} · owe you ${formatFinanceMoney(owedMinor, currencyCode)}`}
      </p>
      <ul
        aria-label="Customer balances"
        className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
      >
        {rows.map((customer) => {
          const owes = customer.owedMinor !== "0"
          const ahead = !owes && customer.paidAheadMinor !== "0"
          return (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onOpen(customer.id)}
                className="grid min-h-[72px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] md:grid-cols-[minmax(0,1fr)_11rem_12rem_auto]"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-base font-medium">
                    {customer.name}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {contact(customer)}
                  </span>
                </span>
                <span className="max-md:col-start-1 max-md:row-start-2">
                  <OwingSince customer={customer} />
                </span>
                <span className="hidden text-sm md:block">
                  <LastPayment customer={customer} currency={currencyCode} />
                </span>
                <span className="grid justify-items-end text-right max-md:col-start-2 max-md:row-span-2 max-md:row-start-1">
                  <span
                    className={`text-base font-semibold tabular-nums ${owes ? "text-amber-700 dark:text-amber-300" : ""}`}
                  >
                    {owes || ahead
                      ? formatFinanceMoney(
                          owes ? customer.owedMinor : customer.paidAheadMinor,
                          currencyCode,
                        )
                      : "—"}
                  </span>
                  {owes || ahead ? (
                    <span className="text-sm text-muted-foreground">
                      {owes ? "owes you" : "paid ahead"}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
