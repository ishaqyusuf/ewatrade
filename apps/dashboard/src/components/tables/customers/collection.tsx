"use client"

import {
  type CollectionView,
  RowSelectCheckbox,
} from "@/components/tables/core"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { Row } from "@tanstack/react-table"
import { CustomerActionsMenu } from "./action-menu"
import {
  CUSTOMER_SUBTITLE_CLASS,
  CustomerAvatar,
  CustomerBalance,
  CustomerName,
  describeCustomerBalance,
  formatCustomerDate,
  getCustomerContact,
} from "./columns"

type CollectionProps = {
  rows: Row<DashboardCustomerRow>[]
  currencyCode: string
  canSeeBalances: boolean
  onEdit: (customerId: string) => void
}

function Contact({ customer }: { customer: DashboardCustomerRow }) {
  const missing = !customer.phone && !customer.email
  return (
    <p className={`${CUSTOMER_SUBTITLE_CLASS} ${missing ? "italic" : ""}`}>
      {getCustomerContact(customer)}
    </p>
  )
}

const spent = (customer: DashboardCustomerRow, currencyCode: string) =>
  formatFinanceMoney(customer.totalMinor, currencyCode)

/** Grid columns are fixed by screen width: 1, then 2 at md, 3 at lg, 4 at xl. */
function CustomersGrid({
  rows,
  currencyCode,
  canSeeBalances,
  onEdit,
}: CollectionProps) {
  return (
    <ul
      aria-label="Customer grid"
      className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {rows.map((row) => {
        const customer = row.original
        return (
          <li key={row.id} className="min-w-0">
            <article
              data-state={row.getIsSelected() ? "selected" : undefined}
              className="flex h-full flex-col gap-3 rounded-xl border bg-card p-3.5 data-[state=selected]:border-transparent data-[state=selected]:ring-2 data-[state=selected]:ring-primary"
            >
              <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2.5">
                <CustomerAvatar customer={customer} className="size-9" />
                <div className="grid min-w-0 gap-0.5">
                  <CustomerName
                    customer={customer}
                    canSeeBalances={canSeeBalances}
                    className="text-[15px]"
                  />
                  <Contact customer={customer} />
                </div>
                <div className="flex items-center gap-0.5">
                  <RowSelectCheckbox
                    row={row}
                    label={`Select ${customer.name}`}
                  />
                  <CustomerActionsMenu
                    customer={customer}
                    canSeeBalances={canSeeBalances}
                    onEdit={onEdit}
                  />
                </div>
              </div>
              {canSeeBalances ? (
                <BalanceBox customer={customer} currencyCode={currencyCode} />
              ) : null}
              <div className="mt-auto flex items-baseline justify-between gap-2 border-t pt-2.5 text-[13.5px] text-muted-foreground tabular-nums">
                {customer.lastOrder ? (
                  <>
                    <span>
                      <span className="font-semibold text-foreground">
                        {customer.orderCount}
                      </span>{" "}
                      {customer.orderCount === 1 ? "order" : "orders"}
                    </span>
                    <span className="font-semibold text-foreground">
                      {spent(customer, currencyCode)}
                    </span>
                    <span>
                      {formatCustomerDate(customer.lastOrder.createdAt)}
                    </span>
                  </>
                ) : (
                  <>
                    <span>No orders yet</span>
                    <span>
                      Added {formatCustomerDate(customer.firstSeenAt)}
                    </span>
                  </>
                )}
              </div>
            </article>
          </li>
        )
      })}
    </ul>
  )
}

function BalanceBox({
  customer,
  currencyCode,
}: {
  customer: DashboardCustomerRow
  currencyCode: string
}) {
  const view = customer.balance
    ? describeCustomerBalance(customer.balance)
    : null
  const label =
    view?.kind === "owes"
      ? view.afterPaidAheadMinor
        ? "Owes you, after paid ahead"
        : "Owes you"
      : view?.kind === "paidAhead"
        ? "Paid ahead"
        : "Balance"
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted px-3 py-2.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {view && view.kind !== "settled" ? (
        <span
          className={
            view.kind === "owes"
              ? "text-[17px] font-semibold tabular-nums text-amber-700 dark:text-amber-300"
              : "text-[17px] font-semibold tabular-nums text-primary"
          }
        >
          {formatFinanceMoney(view.amountMinor, currencyCode)}
        </span>
      ) : (
        <span className="text-[15px] text-muted-foreground">
          {view ? "Paid up" : "—"}
        </span>
      )}
    </div>
  )
}

/** One bordered panel with a divided row per customer; details wrap under the name on phones. */
function CustomersList({
  rows,
  currencyCode,
  canSeeBalances,
  onEdit,
}: CollectionProps) {
  return (
    <ul aria-label="Customer list" className="divide-y rounded-lg border">
      {rows.map((row) => {
        const customer = row.original
        return (
          <li
            key={row.id}
            data-state={row.getIsSelected() ? "selected" : undefined}
            className={`grid grid-cols-[1rem_2.25rem_minmax(0,1fr)_2rem] items-center gap-x-3.5 gap-y-1.5 px-3.5 py-2.5 data-[state=selected]:bg-muted ${
              canSeeBalances
                ? "md:grid-cols-[1rem_2.25rem_minmax(0,1fr)_11rem_8rem_2rem] lg:grid-cols-[1rem_2.25rem_minmax(0,1fr)_12rem_8rem_7rem_2rem]"
                : "md:grid-cols-[1rem_2.25rem_minmax(0,1fr)_8rem_2rem] lg:grid-cols-[1rem_2.25rem_minmax(0,1fr)_8rem_7rem_2rem]"
            }`}
          >
            <RowSelectCheckbox row={row} label={`Select ${customer.name}`} />
            <CustomerAvatar customer={customer} className="size-9" />
            <div className="grid min-w-0 gap-0.5">
              <CustomerName
                customer={customer}
                canSeeBalances={canSeeBalances}
                className="text-[15px]"
              />
              <Contact customer={customer} />
            </div>
            {canSeeBalances ? (
              <div className="min-w-0 max-md:col-start-3 max-md:row-start-2">
                <CustomerBalance
                  balance={customer.balance}
                  currencyCode={currencyCode}
                />
              </div>
            ) : null}
            <p className="text-sm tabular-nums max-md:col-start-3">
              {customer.orderCount ? (
                <>
                  {spent(customer, currencyCode)}
                  <span className="block text-[12.5px] text-muted-foreground max-md:inline max-md:pl-1.5">
                    {customer.orderCount}{" "}
                    {customer.orderCount === 1 ? "order" : "orders"}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">No orders yet</span>
              )}
            </p>
            <p className="hidden text-sm lg:block">
              {customer.lastOrder ? (
                <>
                  {formatCustomerDate(customer.lastOrder.createdAt)}
                  <span className="block text-[12.5px] text-muted-foreground">
                    Last order
                  </span>
                </>
              ) : (
                <span className="block text-[12.5px] text-muted-foreground">
                  Added {formatCustomerDate(customer.firstSeenAt)}
                </span>
              )}
            </p>
            <div className="max-md:col-start-4 max-md:row-start-1">
              <CustomerActionsMenu
                customer={customer}
                canSeeBalances={canSeeBalances}
                onEdit={onEdit}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function CustomerCollection({
  view,
  ...props
}: CollectionProps & { view: CollectionView }) {
  return view === "cards" ? (
    <CustomersGrid {...props} />
  ) : (
    <CustomersList {...props} />
  )
}
