"use client"

import { describeCustomerBalance } from "@/components/tables/customers/columns"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import { Button, cn } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useState } from "react"

const PAGE = 50

export const customerFilters = [
  { id: "all", label: "All" },
  { id: "owe", label: "Owe you" },
  { id: "ahead", label: "Paid ahead" },
] as const
export type CustomerFilter = (typeof customerFilters)[number]["id"]

/** Search and filter the loaded customer book on the device. */
export function filterCustomers(
  rows: DashboardCustomerRow[],
  query: string,
  filter: CustomerFilter,
) {
  const needle = query.trim().toLowerCase()
  const digits = needle.replace(/\D/g, "")
  return rows.filter((row) => {
    if (filter !== "all") {
      const view = row.balance ? describeCustomerBalance(row.balance) : null
      if (filter === "owe" && view?.kind !== "owes") return false
      if (filter === "ahead" && view?.kind !== "paidAhead") return false
    }
    if (!needle) return true
    return (
      row.name.toLowerCase().includes(needle) ||
      (row.email ?? "").toLowerCase().includes(needle) ||
      (digits.length >= 3 &&
        (row.phone ?? "").replace(/\D/g, "").includes(digits))
    )
  })
}

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/)
  return `${words[0]?.[0] ?? "?"}${words[1]?.[0] ?? ""}`.toUpperCase()
}

const orders = (count: number) => `${count} ${count === 1 ? "order" : "orders"}`

/**
 * Every customer in one list. Owners and admins see what each owes; everyone
 * sees returnables still out. A row opens the customer's details sheet.
 */
export function CustomerList({
  rows,
  currencyCode,
  canSeeBalances,
  returnablesOut,
  onOpen,
}: {
  rows: DashboardCustomerRow[]
  currencyCode: string
  canSeeBalances: boolean
  /** customerId → "3 egg crates out" */
  returnablesOut: Map<string, string>
  onOpen: (customerId: string) => void
}) {
  const [shown, setShown] = useState(PAGE)
  const visible = rows.slice(0, shown)
  return (
    <div className="grid gap-3">
      <ul
        aria-label="Customers"
        className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
      >
        {visible.map((row) => {
          const walkIn = row.identityType === "walk-in"
          const view =
            canSeeBalances && row.balance
              ? describeCustomerBalance(row.balance)
              : null
          const out = row.customerId
            ? returnablesOut.get(row.customerId)
            : undefined
          const contact = walkIn
            ? orders(row.orderCount)
            : (row.phone ?? row.email ?? "No phone")
          const body = (
            <>
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--avatar)] text-sm font-semibold text-[var(--avatar-foreground)]"
              >
                {walkIn ? "·" : initials(row.name)}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-base font-medium">
                  {row.name}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {contact}
                  {out ? (
                    <span className="text-foreground">{` · ${out}`}</span>
                  ) : null}
                </span>
              </span>
              <span className="grid shrink-0 justify-items-end gap-0.5 text-right">
                {view && view.kind !== "settled" ? (
                  <>
                    <span
                      className={cn(
                        "text-base font-semibold tabular-nums",
                        view.kind === "owes" &&
                          "text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {formatFinanceMoney(view.amountMinor, currencyCode)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {view.kind === "owes" ? "owes you" : "paid ahead"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-base tabular-nums">
                      {formatFinanceMoney(row.totalMinor, currencyCode)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {row.orderCount
                        ? walkIn
                          ? "in all"
                          : orders(row.orderCount)
                        : "No orders yet"}
                    </span>
                  </>
                )}
              </span>
            </>
          )
          const rowClass =
            "flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left"
          return (
            <li key={row.id}>
              {row.customerId ? (
                <button
                  type="button"
                  className={cn(
                    rowClass,
                    "transition-colors hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]",
                  )}
                  onClick={() => row.customerId && onOpen(row.customerId)}
                >
                  {body}
                </button>
              ) : (
                <div className={rowClass}>{body}</div>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > shown ? (
        <Button
          variant="outline"
          className="w-full sm:w-fit"
          onClick={() => setShown((count) => count + PAGE)}
        >
          {`Show more (${rows.length - shown})`}
        </Button>
      ) : null}
    </div>
  )
}
